// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Pure parsing of Steam's appdetails response (representative fixture:
// native game with HTML requirements, non-native with mac_requirements=[] and
// unknown appid with success=false).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSteamDetails } from '../src/lib/client';
import { stubChrome } from './chrome-mock';
import { must } from './helpers';

const json: unknown = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'steam_appdetails.json'), 'utf8'),
);

describe('parseSteamDetails', () => {
  it('extrae nombre, flag mac, requisitos sin HTML y año', () => {
    const d = must(parseSteamDetails(json, '1086940'));
    expect(d.name).toBe("Baldur's Gate 3");
    expect(d.mac).toBe(true);
    expect(d.macRequirements).toContain('Apple Silicon M1');
    expect(d.macRequirements).toContain('M2 Pro');
    expect(d.macRequirements).not.toMatch(/<[^>]*>/);
    expect(d.releaseYear).toBe(2023);
  });

  it('no-nativo: mac_requirements=[] tolerado y sin requisitos guardados', () => {
    const d = must(parseSteamDetails(json, '440'));
    expect(d.mac).toBe(false);
    expect(d.macRequirements).toBeNull();
    expect(d.releaseYear).toBe(2007);
  });

  it('success=false → null', () => {
    expect(parseSteamDetails(json, '999999')).toBeNull();
  });

  it('appid ausente o respuesta rara → null', () => {
    expect(parseSteamDetails(json, '123')).toBeNull();
    expect(parseSteamDetails(null, '1')).toBeNull();
    expect(parseSteamDetails({}, '1')).toBeNull();
  });

  it('sin release_date ni requisitos → campos null', () => {
    const d = must(
      parseSteamDetails(
        { '7': { success: true, data: { name: 'X', platforms: { mac: true } } } },
        '7',
      ),
    );
    expect(d).toMatchObject({ name: 'X', mac: true, macRequirements: null, releaseYear: null });
  });
});

describe('single-flight de search/getApp', () => {
  beforeEach(() => {
    vi.resetModules(); // fresh module: inflight maps/cache L1 are module state
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cwSearch = readFileSync(join(__dirname, 'fixtures', 'cw_name.html'), 'utf8');
  const cwApp = readFileSync(join(__dirname, 'fixtures', 'cw_elden.html'), 'utf8');

  it('búsquedas concurrentes del mismo nombre comparten fetch y parse', async () => {
    const mock = stubChrome();
    let fetches = 0;
    mock.onSendMessage(() => {
      fetches++;
      return { ok: true, body: cwSearch, finalUrl: '' };
    });
    const client = await import('../src/lib/client');
    const [a, b] = await Promise.all([client.search('Elden Ring'), client.search('Elden Ring')]);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(fetches).toBe(1);
    // Settled: the next call is served by the cache, not the flight.
    expect((await client.search('Elden Ring')).length).toBe(a.length);
    expect(fetches).toBe(1);
  });

  it('getApp concurrente del mismo slug comparte fetch; slugs distintos no', async () => {
    const mock = stubChrome();
    let fetches = 0;
    mock.onSendMessage(() => {
      fetches++;
      return { ok: true, body: cwApp, finalUrl: '' };
    });
    const client = await import('../src/lib/client');
    const [a, b] = await Promise.all([
      client.getApp('elden-ring'),
      client.getApp('elden-ring'),
    ]);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    expect(fetches).toBe(1);
    await client.getApp('other-game');
    expect(fetches).toBe(2);
  });

  it('un fallo limpia el vuelo: el siguiente caller no hereda el rechazo', async () => {
    const mock = stubChrome();
    let fetches = 0;
    mock.onSendMessage(() => {
      fetches++;
      return { ok: false, error: 'down', code: 'network' };
    });
    const client = await import('../src/lib/client');
    await expect(client.getApp('elden-ring')).rejects.toThrow();
    // The slot was cleared on settle; a retry is blocked only by the
    // failure memo (by design), not by a stuck shared rejection.
    await expect(client.getApp('elden-ring')).rejects.toThrow(/cooling down/);
    expect(fetches).toBe(1);
  });
});
