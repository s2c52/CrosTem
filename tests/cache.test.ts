// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Cache lifecycle: TTL expiry, the in-memory L1 and its cross-context
// invalidation, the daily sweep throttle, quota handling and soft-limit
// eviction. The module is re-imported per test (module-level L1 state).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_STALE_WINDOW_MS,
  CACHE_SWEEP_INTERVAL_MS,
  CACHE_WRITE_COALESCE_MS,
  CACHE_WRITE_FLUSH_MAX,
} from '../src/lib/constants';

/** An expires value already past the stale window at t=1_000_000. */
const BEYOND_WINDOW = 1_000_000 - CACHE_STALE_WINDOW_MS - 1;
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

/** set() resolves at schedule time; storage assertions need the coalesced
 * flush to have run, so advance past the write window first. */
async function setFlushed(key: string, value: unknown, ttlMs?: number): Promise<void> {
  const p = cache.set(key, value, ttlMs);
  await vi.advanceTimersByTimeAsync(CACHE_WRITE_COALESCE_MS);
  await p;
}

describe('get/set con TTL', () => {
  it('devuelve el valor vigente y undefined tras expirar', async () => {
    await setFlushed('k', 'v', 10_000);
    expect(await cache.get('k')).toBe('v');
    vi.setSystemTime(1_000_000 + 10_001);
    expect(await cache.get('k')).toBeUndefined();
    // Kept in storage: it is SWR fodder while inside the stale window.
    expect(mock.local['cache:k']).toBeDefined();
    // Past the stale window it is lazily removed.
    vi.setSystemTime(1_000_000 + 10_000 + CACHE_STALE_WINDOW_MS + 1);
    expect(await cache.get('k')).toBeUndefined();
    expect(mock.local['cache:k']).toBeUndefined();
  });
});

describe('getSwr (stale-while-revalidate)', () => {
  it('sirve una entrada vencida dentro de la ventana y marca la pasada', async () => {
    await cache.set('k', 'v', 10_000);
    vi.setSystemTime(1_000_000 + 10_001);
    const swr = { staleServed: false };
    expect(await cache.getSwr('k', swr)).toBe('v');
    expect(swr.staleServed).toBe(true);
  });

  it('una entrada vigente no marca la pasada', async () => {
    await cache.set('k', 'v', 10_000);
    const swr = { staleServed: false };
    expect(await cache.getSwr('k', swr)).toBe('v');
    expect(swr.staleServed).toBe(false);
  });

  it('más allá de la ventana no sirve nada y limpia', async () => {
    await setFlushed('k', 'v', 10_000);
    expect(mock.local['cache:k']).toBeDefined();
    vi.setSystemTime(1_000_000 + 10_000 + CACHE_STALE_WINDOW_MS + 1);
    const swr = { staleServed: false };
    expect(await cache.getSwr('k', swr)).toBeUndefined();
    expect(swr.staleServed).toBe(false);
    expect(mock.local['cache:k']).toBeUndefined();
  });
});

describe('L1 en memoria', () => {
  it('sirve repeticiones sin tocar storage, incluso tras el eco del propio set', async () => {
    // setFlushed makes the mock fire onChanged for our own write; the
    // own-write ledger must keep the L1 entry instead of evicting it.
    await setFlushed('k', 'v', 10_000);
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

  it('una escritura externa (options clear) invalida el L1 y lo pendiente', async () => {
    void cache.set('k', 'v', 10_000);
    expect(await cache.get('k')).toBe('v');
    delete mock.local['cache:k']; // simulate the raw remove from options.ts
    mock.emitStorageChange({ 'cache:k': { oldValue: 'v' } }, 'local');
    expect(await cache.get('k')).toBeUndefined();
    // The still-unflushed write was dropped too: a late flush must not
    // resurrect what the user just cleared.
    await vi.advanceTimersByTimeAsync(CACHE_WRITE_COALESCE_MS);
    expect(mock.local['cache:k']).toBeUndefined();
  });

  it('remove invalida L1 y storage', async () => {
    await setFlushed('k', 'v', 10_000);
    await cache.remove('k');
    expect(await cache.get('k')).toBeUndefined();
    expect(mock.local['cache:k']).toBeUndefined();
  });
});

describe('coalescing de escrituras', () => {
  it('varios set en la ventana -> un solo storage.set y L1 intacto', async () => {
    const writes = [cache.set('a', 1, 10_000), cache.set('b', 2, 10_000), cache.set('c', 3, 10_000)];
    await vi.advanceTimersByTimeAsync(CACHE_WRITE_COALESCE_MS);
    await Promise.all(writes);
    expect(mock.localSets()).toBe(1);
    expect(mock.local['cache:a']).toEqual(entry(1, 1_010_000));
    expect(mock.local['cache:b']).toEqual(entry(2, 1_010_000));
    expect(mock.local['cache:c']).toEqual(entry(3, 1_010_000));
    // The single multi-key change event did not evict our own entries.
    const before = mock.localGets();
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('b')).toBe(2);
    expect(mock.localGets()).toBe(before);
  });

  it('al llegar al tope la tanda se vacía sin esperar la ventana', async () => {
    for (let i = 0; i < CACHE_WRITE_FLUSH_MAX; i++) void cache.set(`k${i}`, i, 10_000);
    await vi.advanceTimersByTimeAsync(0); // drain microtasks only, no window
    expect(mock.localSets()).toBe(1);
    expect(mock.local['cache:k0']).toBeDefined();
    expect(mock.local[`cache:k${CACHE_WRITE_FLUSH_MAX - 1}`]).toBeDefined();
  });

  it('una escritura ajena con otro expires evicta L1 y descarta lo pendiente', async () => {
    void cache.set('k', 'mine', 10_000);
    expect(await cache.get('k')).toBe('mine');
    const foreign = entry('theirs', 1_500_000);
    mock.local['cache:k'] = foreign;
    mock.emitStorageChange({ 'cache:k': { newValue: foreign } }, 'local');
    expect(await cache.get('k')).toBe('theirs');
    // Our pending write was discarded: the flush must not clobber the
    // fresher foreign value.
    await vi.advanceTimersByTimeAsync(CACHE_WRITE_COALESCE_MS);
    expect(mock.local['cache:k']).toEqual(foreign);
  });

  it('remove tras set: el flush tardío no resucita la entrada', async () => {
    void cache.set('k', 'v', 10_000);
    await cache.remove('k');
    await vi.advanceTimersByTimeAsync(CACHE_WRITE_COALESCE_MS);
    expect(mock.local['cache:k']).toBeUndefined();
    expect(await cache.get('k')).toBeUndefined();
  });
});

describe('coalescing de lecturas', () => {
  it('misses concurrentes comparten un solo storage.get', async () => {
    mock.local['cache:a'] = entry('x', 2_000_000);
    mock.local['cache:b'] = entry('y', 2_000_000);
    const before = mock.localGets();
    const [a, b] = await Promise.all([cache.get('a'), cache.get('b')]);
    expect(a).toBe('x');
    expect(b).toBe('y');
    expect(mock.localGets()).toBe(before + 1);
  });
});

describe('sweepExpired', () => {
  it('barre lo malformado y lo vencido más allá de la ventana stale', async () => {
    mock.local['cache:live'] = entry('a', 2_000_000);
    mock.local['cache:stale'] = entry('s', 999_999); // SWR fodder: kept
    mock.local['cache:dead'] = entry('b', BEYOND_WINDOW);
    mock.local['cache:broken'] = { value: 'c' }; // no expires
    mock.local['choice:cw:123'] = 'slug';
    mock.local['settings'] = { x: 1 };
    const swept = await cache.sweepExpired();
    expect(swept).toBe(2);
    expect(Object.keys(mock.local).sort()).toEqual([
      'cache:live',
      'cache:stale',
      'choice:cw:123',
      'settings',
    ]);
  });
});

describe('maybeDailyMaintenance', () => {
  it('respeta el throttle diario', async () => {
    mock.local['cache:dead'] = entry('b', BEYOND_WINDOW);
    await cache.maybeDailyMaintenance();
    expect(mock.local['cache:dead']).toBeUndefined();
    // A new sweepable entry within the same day is left alone.
    mock.local['cache:dead2'] = entry('c', BEYOND_WINDOW);
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
  it('ante quota llena purga expiradas y reintenta la tanda con éxito', async () => {
    mock.local['cache:dead'] = entry('b', BEYOND_WINDOW);
    mock.failLocalSets(1);
    await setFlushed('k', 'v', 10_000);
    expect(mock.local['cache:dead']).toBeUndefined(); // sweep ran
    expect(mock.local['cache:k']).toEqual(entry('v', 1_010_000));
  });

  it('si el reintento también falla no lanza y sirve desde L1', async () => {
    mock.failLocalSets(2);
    await expect(setFlushed('k', 'v', 10_000)).resolves.toBeUndefined();
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
