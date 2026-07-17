// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Cache lifecycle: TTL expiry, the in-memory L1 and its cross-context
// invalidation, the daily sweep throttle, quota handling and soft-limit
// eviction. The module is re-imported per test (module-level L1 state).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_SWEEP_INTERVAL_MS } from '../src/lib/constants';
import { stubChrome, type ChromeMock } from './chrome-mock';

type CacheModule = typeof import('../src/lib/cache');

let mock: ChromeMock;
let cache: CacheModule;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  mock = stubChrome();
  cache = await import('../src/lib/cache');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function entry(value: unknown, expires: number): { value: unknown; expires: number } {
  return { value, expires };
}

describe('get/set con TTL', () => {
  it('devuelve el valor vigente y undefined tras expirar', async () => {
    await cache.set('k', 'v', 10_000);
    expect(await cache.get('k')).toBe('v');
    vi.setSystemTime(1_000_000 + 10_001);
    expect(await cache.get('k')).toBeUndefined();
    expect(mock.local['cache:k']).toBeUndefined(); // lazy removal
  });
});

describe('L1 en memoria', () => {
  it('sirve repeticiones sin tocar storage', async () => {
    await cache.set('k', 'v', 10_000);
    const before = mock.localGets();
    expect(await cache.get('k')).toBe('v');
    expect(await cache.get('k')).toBe('v');
    expect(mock.localGets()).toBe(before); // both hits came from L1
  });

  it('puebla el L1 desde storage en el primer miss', async () => {
    mock.local['cache:k'] = entry('v', 2_000_000);
    expect(await cache.get('k')).toBe('v');
    const before = mock.localGets();
    expect(await cache.get('k')).toBe('v');
    expect(mock.localGets()).toBe(before);
  });

  it('una escritura externa (options clear) invalida el L1', async () => {
    await cache.set('k', 'v', 10_000);
    expect(await cache.get('k')).toBe('v');
    delete mock.local['cache:k']; // simulate the raw remove from options.ts
    mock.emitStorageChange({ 'cache:k': { oldValue: 'v' } }, 'local');
    expect(await cache.get('k')).toBeUndefined();
  });

  it('remove invalida L1 y storage', async () => {
    await cache.set('k', 'v', 10_000);
    await cache.remove('k');
    expect(await cache.get('k')).toBeUndefined();
    expect(mock.local['cache:k']).toBeUndefined();
  });
});

describe('sweepExpired', () => {
  it('barre solo entradas cache: expiradas o malformadas', async () => {
    mock.local['cache:live'] = entry('a', 2_000_000);
    mock.local['cache:dead'] = entry('b', 999_999);
    mock.local['cache:broken'] = { value: 'c' }; // no expires
    mock.local['choice:cw:123'] = 'slug';
    mock.local['settings'] = { x: 1 };
    const swept = await cache.sweepExpired();
    expect(swept).toBe(2);
    expect(Object.keys(mock.local).sort()).toEqual(['cache:live', 'choice:cw:123', 'settings']);
  });
});

describe('maybeDailyMaintenance', () => {
  it('respeta el throttle diario', async () => {
    mock.local['cache:dead'] = entry('b', 999_999);
    await cache.maybeDailyMaintenance();
    expect(mock.local['cache:dead']).toBeUndefined();
    // A new expired entry within the same day is left alone.
    mock.local['cache:dead2'] = entry('c', 999_999);
    await cache.maybeDailyMaintenance();
    expect(mock.local['cache:dead2']).toBeDefined();
    // Past the interval it gets swept.
    vi.setSystemTime(1_000_000 + CACHE_SWEEP_INTERVAL_MS + 1);
    await cache.maybeDailyMaintenance();
    expect(mock.local['cache:dead2']).toBeUndefined();
  });

  it('nunca propaga errores', async () => {
    mock.failLocalSets(5); // stamp write will fail
    await expect(cache.maybeDailyMaintenance()).resolves.toBeUndefined();
  });
});

describe('quota en set', () => {
  it('ante quota llena purga expiradas y reintenta con éxito', async () => {
    mock.local['cache:dead'] = entry('b', 999_999);
    mock.failLocalSets(1);
    await cache.set('k', 'v', 10_000);
    expect(mock.local['cache:dead']).toBeUndefined(); // sweep ran
    expect(mock.local['cache:k']).toEqual(entry('v', 1_010_000));
  });

  it('si el reintento también falla no lanza y sirve desde L1', async () => {
    mock.failLocalSets(2);
    await expect(cache.set('k', 'v', 10_000)).resolves.toBeUndefined();
    expect(mock.local['cache:k']).toBeUndefined();
    expect(await cache.get('k')).toBe('v'); // L1 keeps this context working
  });
});

describe('enforceQuotaSoftLimit', () => {
  it('no evicta por debajo del límite blando', async () => {
    mock.local['cache:a'] = entry('x', 2_000_000);
    mock.setBytesInUse(1024);
    expect(await cache.enforceQuotaSoftLimit()).toBe(0);
    expect(mock.local['cache:a']).toBeDefined();
  });

  it('evicta las más próximas a expirar hasta bajar del target', async () => {
    const big = 'x'.repeat(600_000); // ~600KB per entry as JSON
    mock.local['cache:oldest'] = entry(big, 1_500_000);
    mock.local['cache:middle'] = entry(big, 1_600_000);
    mock.local['cache:newest'] = entry(big, 1_700_000);
    mock.local['choice:cw:123'] = 'slug';
    // 4.2MB used, target 3MB: evicting two ~600KB entries reaches it.
    mock.setBytesInUse(4_200_000);
    const evicted = await cache.enforceQuotaSoftLimit();
    expect(evicted).toBe(2);
    expect(mock.local['cache:oldest']).toBeUndefined();
    expect(mock.local['cache:middle']).toBeUndefined();
    expect(mock.local['cache:newest']).toBeDefined();
    expect(mock.local['choice:cw:123']).toBe('slug'); // never touched
  });
});
