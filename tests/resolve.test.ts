// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveGame } from '../src/lib/resolve';
import { resolveCw, type CwResolution } from '../src/lib/cw';
import { agwLookupDetailed } from '../src/lib/agw';
import { anticheatLookup } from '../src/lib/awacy';
import { getSettings } from '../src/lib/settings';
import type { AgwCompat, CwAppPage } from '../src/types';
import type { Settings } from '../src/lib/settings';

vi.mock('../src/lib/cw', () => ({ resolveCw: vi.fn() }));
vi.mock('../src/lib/agw', () => ({ agwLookupDetailed: vi.fn() }));
vi.mock('../src/lib/awacy', () => ({ anticheatLookup: vi.fn() }));
vi.mock('../src/lib/settings', () => ({ getSettings: vi.fn() }));

const settings = (sources: Settings['sources']): Settings => ({
  surfaces: { app: true, capsules: true, search: true, wishlist: true, library: true },
  sources,
  crossoverVersion: '',
  cacheTtlDays: 7,
  language: 'auto',
});

const allOn = settings({ cw: true, agw: true, anticheat: true });

const cwHit = (stars: number, status: string): CwResolution => {
  const app: CwAppPage = {
    slug: 'test-game',
    mac: { stars, status, lastTested: '26.0', reportCount: 3 },
    linux: null,
    versions: [],
    aggregate: null,
  };
  return { kind: 'hit', slug: 'test-game', cwName: 'Test Game', approximate: false, stars, app };
};

const agwPlayable: AgwCompat = {
  page: 'Test Game',
  crossover: 'playable',
  parallels: 'na',
  native: 'na',
  rosetta2: 'na',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSettings).mockResolvedValue(allOn);
  vi.mocked(resolveCw).mockResolvedValue({ kind: 'none' });
  vi.mocked(agwLookupDetailed).mockResolvedValue({ result: null, candidates: [] });
  vi.mocked(anticheatLookup).mockResolvedValue(null);
});

describe('resolveGame', () => {
  it('combines a CodeWeavers hit into a green verdict', async () => {
    vi.mocked(resolveCw).mockResolvedValue(cwHit(5, 'Runs Great'));
    const r = await resolveGame('Test Game', '10');
    expect(r.cw.kind).toBe('hit');
    expect(r.verdict).toBe('green');
  });

  it('passes an ambiguous CodeWeavers resolution through untouched', async () => {
    const ambiguous: CwResolution = {
      kind: 'ambiguous',
      candidates: [
        { slug: 'a', name: 'A', company: 'ACME', lastUpdated: '2026-01-01', stars: 4, score: 1 },
      ],
    };
    vi.mocked(resolveCw).mockResolvedValue(ambiguous);
    const r = await resolveGame('Test Game', '10');
    expect(r.cw).toEqual(ambiguous);
    // Verdict is computed without CW data (nothing else replied).
    expect(r.verdict).toBe('unknown');
  });

  it('skips disabled sources entirely', async () => {
    vi.mocked(getSettings).mockResolvedValue(
      settings({ cw: false, agw: false, anticheat: false }),
    );
    const r = await resolveGame('Test Game', '10');
    expect(resolveCw).not.toHaveBeenCalled();
    expect(agwLookupDetailed).not.toHaveBeenCalled();
    expect(anticheatLookup).not.toHaveBeenCalled();
    expect(r.cw.kind).toBe('none');
    expect(r.agw).toBeNull();
    expect(r.ac).toBeNull();
  });

  it('AGW and anticheat failures never break the result', async () => {
    vi.mocked(resolveCw).mockResolvedValue(cwHit(5, 'Runs Great'));
    vi.mocked(agwLookupDetailed).mockRejectedValue(new Error('network'));
    vi.mocked(anticheatLookup).mockRejectedValue(new Error('network'));
    const r = await resolveGame('Test Game', '10');
    expect(r.agw).toBeNull();
    expect(r.ac).toBeNull();
    expect(r.verdict).toBe('green');
  });

  it('uses AGW data when CodeWeavers has nothing', async () => {
    vi.mocked(agwLookupDetailed).mockResolvedValue({ result: agwPlayable, candidates: [] });
    const r = await resolveGame('Test Game', '10');
    expect(r.verdict).toBe('green');
  });

  it('surfaces AGW candidates for the correction picker', async () => {
    const candidates = [
      { slug: 'Test Game II', name: 'Test Game II', company: '', lastUpdated: '', stars: null, score: 1 },
    ];
    vi.mocked(agwLookupDetailed).mockResolvedValue({ result: null, candidates });
    const r = await resolveGame('Test Game', '10');
    expect(r.agwCandidates).toEqual(candidates);
  });

  it('forwards forcePicker and loadAppPage to resolveCw', async () => {
    await resolveGame('Test Game', '10', { forcePicker: true, loadAppPage: false });
    expect(resolveCw).toHaveBeenCalledWith('Test Game', '10', {
      forcePicker: true,
      loadAppPage: false,
    });
  });
});
