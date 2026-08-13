// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Bulk scan resolver: pacing, concurrency, abort, breaker handling and
// the unknown-vs-error separation. Sources are mocked; the verdict
// engine runs real (it is pure and has its own tests).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMany, type BulkItem } from '../src/lib/bulk';
import { agwLookup } from '../src/lib/agw';
import { anticheatLookup } from '../src/lib/awacy';
import { BreakerOpenError, steamDetails } from '../src/lib/client';
import { SCAN_BREAKER_WAIT_MS } from '../src/lib/constants';
import { resolveCw, type CwResolution } from '../src/lib/cw';
import { getSettings } from '../src/lib/settings';
import type { Settings } from '../src/lib/settings';
import type { AgwCompat, SteamDetails } from '../src/types';

// Stands in for client.ts's dispatched-fetch counter: source mocks that
// simulate a network hit bump it; cache-served mocks leave it alone.
const net = vi.hoisted(() => ({ fetches: 0 }));

vi.mock('../src/lib/client', () => {
  class BreakerOpenError extends Error {}
  return { BreakerOpenError, steamDetails: vi.fn(), fetchCount: () => net.fetches };
});
vi.mock('../src/lib/cw', () => ({ resolveCw: vi.fn() }));
vi.mock('../src/lib/agw', () => ({ agwLookup: vi.fn() }));
vi.mock('../src/lib/awacy', () => ({ anticheatLookup: vi.fn() }));
vi.mock('../src/lib/settings', () => ({ getSettings: vi.fn() }));

const steam = vi.mocked(steamDetails);
const cw = vi.mocked(resolveCw);
const agw = vi.mocked(agwLookup);
const ac = vi.mocked(anticheatLookup);
const settingsMock = vi.mocked(getSettings);

const settings = (sources: Settings['sources']): Settings => ({
  surfaces: { app: true, capsules: true, search: true, wishlist: true, library: true },
  sources,
  crossoverVersion: '',
  cacheTtlDays: 7,
  language: 'auto',
});
const ALL_ON = settings({ cw: true, agw: true, anticheat: true });

const game = (appid: string, name = `Game ${appid}`) => ({ appid, name });
const notMac = (name: string): SteamDetails => ({ name, mac: false });
const cwHit = (stars: number) =>
  ({ kind: 'hit', slug: 's', cwName: 'CW Name', approximate: false, stars, app: null }) as const;
const agwBroken: AgwCompat = {
  page: 'X',
  crossover: 'unplayable',
  parallels: 'unknown',
  native: 'unknown',
  rosetta2: 'unknown',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  net.fetches = 0;
  settingsMock.mockResolvedValue(ALL_ON);
  steam.mockResolvedValue(null);
  cw.mockResolvedValue({ kind: 'none' });
  agw.mockResolvedValue(null);
  ac.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveMany', () => {
  it('short-circuits native games without touching the sources', async () => {
    steam.mockResolvedValue({ name: 'Native Game', mac: true });
    const out = await resolveMany([game('10')], { minSpacingMs: 0 });
    expect(out.completed).toBe(true);
    expect(out.items).toEqual([
      { appid: '10', name: 'Game 10', status: 'green', native: true, degraded: false },
    ]);
    expect(out.tallies).toEqual({ green: 1, yellow: 0, red: 0, unknown: 0, error: 0, native: 1 });
    expect(cw).not.toHaveBeenCalled();
    expect(agw).not.toHaveBeenCalled();
    expect(ac).not.toHaveBeenCalled();
  });

  it('tallies a mixed library and mirrors every item through onItem', async () => {
    steam.mockImplementation((appid) =>
      Promise.resolve(appid === '1' ? { name: 'A', mac: true } : notMac('Game')),
    );
    cw.mockImplementation((_name, appid) =>
      Promise.resolve<CwResolution>(appid === '2' ? cwHit(5) : { kind: 'none' }),
    );
    agw.mockImplementation((_name, appid) => {
      if (appid === '3') return Promise.resolve(agwBroken);
      if (appid === '5') return Promise.reject(new Error('agw down'));
      return Promise.resolve(null);
    });

    const seen: BulkItem[] = [];
    const out = await resolveMany(['1', '2', '3', '4', '5'].map((id) => game(id)), {
      concurrency: 1,
      minSpacingMs: 0,
      onItem: (item) => seen.push(item),
    });

    expect(out.items.map((i) => [i.appid, i.status])).toEqual([
      ['1', 'green'],
      ['2', 'green'],
      ['3', 'red'],
      ['4', 'unknown'],
      ['5', 'error'],
    ]);
    expect(out.tallies).toEqual({ green: 2, yellow: 0, red: 1, unknown: 1, error: 1, native: 1 });
    expect(seen).toEqual(out.items);
  });

  it('marks a verdict degraded when a source failed but another answered', async () => {
    steam.mockResolvedValue(notMac('X'));
    cw.mockResolvedValue(cwHit(3));
    agw.mockRejectedValue(new Error('agw down'));
    const out = await resolveMany([game('1')], { minSpacingMs: 0 });
    expect(out.items[0]).toMatchObject({ status: 'yellow', degraded: true });
  });

  it('never runs more games than the concurrency cap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    steam.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setTimeout(() => {
            inFlight--;
            resolve(null);
          }, 300);
        }),
    );
    const promise = resolveMany(['1', '2', '3', '4', '5'].map((id) => game(id)), {
      minSpacingMs: 0,
    });
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out.items).toHaveLength(5);
    expect(maxInFlight).toBe(2);
  });

  it('spaces the starts of network-touching games', async () => {
    const t0 = Date.now();
    const starts: number[] = [];
    steam.mockImplementation(() => {
      starts.push(Date.now() - t0);
      net.fetches++; // this lookup dispatched a real fetch
      return new Promise((resolve) => setTimeout(() => resolve(null), 300));
    });
    const promise = resolveMany(['1', '2', '3'].map((id) => game(id)), {
      concurrency: 1,
      minSpacingMs: 1_500,
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(starts).toEqual([0, 1_500, 3_000]);
  });

  it('skips the spacing for games served from cache (no fetch dispatched)', async () => {
    const t0 = Date.now();
    const starts: number[] = [];
    steam.mockImplementation((appid) => {
      starts.push(Date.now() - t0);
      return Promise.resolve({ name: `N${appid}`, mac: true }); // fetch counter untouched
    });
    const promise = resolveMany(['1', '2', '3'].map((id) => game(id)), {
      concurrency: 1,
      minSpacingMs: 1_500,
    });
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out.items).toHaveLength(3);
    expect(starts).toEqual([0, 0, 0]);
  });

  it('keeps the spacing when a concurrent fetch lands mid-resolution', async () => {
    // Conservative attribution: the counter cannot tell whose fetch it
    // was, so a resolution that overlaps any dispatched fetch pays its
    // spacing even if it was itself cache-served.
    const t0 = Date.now();
    const starts: number[] = [];
    steam.mockImplementation((appid) => {
      starts.push(Date.now() - t0);
      net.fetches++; // a neighbour's fetch lands while this game resolves
      return Promise.resolve({ name: `N${appid}`, mac: true });
    });
    const promise = resolveMany(['1', '2'].map((id) => game(id)), {
      concurrency: 1,
      minSpacingMs: 1_500,
    });
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out.items).toHaveLength(2);
    expect(starts).toEqual([0, 1_500]);
  });

  it('stops at an abort and reports the partial outcome honestly', async () => {
    steam.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ name: 'X', mac: true }), 300)),
    );
    const controller = new AbortController();
    const promise = resolveMany(['1', '2', '3'].map((id) => game(id)), {
      concurrency: 1,
      minSpacingMs: 0,
      signal: controller.signal,
      onItem: () => controller.abort(),
    });
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out.completed).toBe(false);
    expect(out.items).toHaveLength(1);
    expect(steam).toHaveBeenCalledTimes(1);
  });

  it('respects disabled sources', async () => {
    settingsMock.mockResolvedValue(settings({ cw: false, agw: false, anticheat: false }));
    steam.mockResolvedValue(notMac('X'));
    const out = await resolveMany([game('1')], { minSpacingMs: 0 });
    // Nothing failed and nothing was asked: an honest unknown, not an error.
    expect(out.items[0]).toMatchObject({ status: 'unknown', degraded: false });
    expect(cw).not.toHaveBeenCalled();
    expect(agw).not.toHaveBeenCalled();
    expect(ac).not.toHaveBeenCalled();
  });

  it('pauses on an open breaker and retries the game once', async () => {
    settingsMock.mockResolvedValue(settings({ cw: true, agw: false, anticheat: false }));
    steam.mockResolvedValue(notMac('X'));
    cw.mockRejectedValueOnce(new BreakerOpenError('open')).mockResolvedValueOnce({ kind: 'none' });

    const promise = resolveMany([game('1')], { minSpacingMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(cw).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SCAN_BREAKER_WAIT_MS);
    const out = await promise;
    expect(cw).toHaveBeenCalledTimes(2);
    // The retry answered cleanly: an unknown, not an error.
    expect(out.items[0]).toMatchObject({ status: 'unknown', degraded: false });
  });
});
