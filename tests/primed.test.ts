// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Primed verdicts: result->code mapping (unknown is NEVER primed), the
// coalesced read-merge-write flush, the no-op skip, the cap reset and
// the empty-map degradation when the index is absent or broken.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIMED_FLUSH_MS, PRIMED_INDEX_MAX } from '../src/lib/constants';
import { stubChrome, type ChromeMock } from './chrome-mock';

type PrimedModule = typeof import('../src/lib/primed');

let mock: ChromeMock;
let primed: PrimedModule;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  mock = stubChrome();
  primed = await import('../src/lib/primed');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function storedIndex(): unknown {
  return mock.local[primed.PRIMED_INDEX_KEY];
}

describe('mapeo resultado -> código', () => {
  it('mapea native y los niveles del semáforo', () => {
    expect(primed.codeForResult({ kind: 'native', arch: null })).toBe('n');
    expect(
      primed.codeForResult({
        kind: 'stars',
        stars: 5,
        slug: 's',
        cwName: 'X',
        approximate: false,
        level: 'green',
      }),
    ).toBe('g');
    expect(primed.codeForResult({ kind: 'ambiguous', count: 2, query: 'x', level: 'yellow' })).toBe(
      'y',
    );
    expect(primed.codeForResult({ kind: 'dot', level: 'red' })).toBe('r');
  });

  it('unknown y none NUNCA se priman', () => {
    expect(primed.codeForResult({ kind: 'dot', level: 'unknown' })).toBeNull();
    expect(primed.codeForResult({ kind: 'none' })).toBeNull();
    expect(primed.codeForLevel('unknown')).toBeNull();
  });

  it('resultForCode produce las mismas formas que el renderer real', () => {
    expect(primed.resultForCode('n')).toEqual({ kind: 'native', arch: null });
    expect(primed.resultForCode('g')).toEqual({ kind: 'dot', level: 'green' });
    expect(primed.resultForCode('r')).toEqual({ kind: 'dot', level: 'red' });
  });
});

describe('flush coalescido', () => {
  it('varios notePrimed -> un solo write que preserva appids ajenos', async () => {
    mock.local[primed.PRIMED_INDEX_KEY] = { v: 1, e: { '111': 'g' } };
    primed.notePrimed('222', 'r');
    primed.notePrimed('333', 'n');
    const before = mock.localSets();
    await vi.advanceTimersByTimeAsync(PRIMED_FLUSH_MS);
    expect(mock.localSets()).toBe(before + 1);
    expect(storedIndex()).toEqual({ v: 1, e: { '111': 'g', '222': 'r', '333': 'n' } });
  });

  it('sin cambios efectivos no escribe nada', async () => {
    mock.local[primed.PRIMED_INDEX_KEY] = { v: 1, e: { '111': 'g' } };
    primed.notePrimed('111', 'g');
    const before = mock.localSets();
    await vi.advanceTimersByTimeAsync(PRIMED_FLUSH_MS);
    expect(mock.localSets()).toBe(before);
  });

  it('un código null borra la entrada rancia', async () => {
    mock.local[primed.PRIMED_INDEX_KEY] = { v: 1, e: { '111': 'g', '222': 'r' } };
    primed.notePrimed('111', null);
    await vi.advanceTimersByTimeAsync(PRIMED_FLUSH_MS);
    expect(storedIndex()).toEqual({ v: 1, e: { '222': 'r' } });
  });

  it('borrar lo que no existe no escribe', async () => {
    primed.notePrimed('999', null);
    const before = mock.localSets();
    await vi.advanceTimersByTimeAsync(PRIMED_FLUSH_MS);
    expect(mock.localSets()).toBe(before);
    expect(storedIndex()).toBeUndefined();
  });

  it('appid ausente es un no-op', async () => {
    primed.notePrimed(null, 'g');
    primed.notePrimed(undefined, 'r');
    const before = mock.localSets();
    await vi.advanceTimersByTimeAsync(PRIMED_FLUSH_MS);
    expect(mock.localSets()).toBe(before);
  });

  it('al superar el tope el índice se reinicia al delta actual', async () => {
    const e: Record<string, string> = {};
    for (let i = 0; i < PRIMED_INDEX_MAX; i++) e[String(i)] = 'g';
    mock.local[primed.PRIMED_INDEX_KEY] = { v: 1, e };
    primed.notePrimed('fresh', 'r');
    await vi.advanceTimersByTimeAsync(PRIMED_FLUSH_MS);
    expect(storedIndex()).toEqual({ v: 1, e: { fresh: 'r' } });
  });
});

describe('loadPrimedIndex', () => {
  it('índice ausente -> mapa vacío (comportamiento pre-priming)', async () => {
    expect((await primed.loadPrimedIndex()).size).toBe(0);
  });

  it('índice roto o de otra versión -> mapa vacío', async () => {
    mock.local[primed.PRIMED_INDEX_KEY] = { v: 99, e: { '1': 'g' } };
    expect((await primed.loadPrimedIndex()).size).toBe(0);
    mock.local[primed.PRIMED_INDEX_KEY] = 'garbage';
    expect((await primed.loadPrimedIndex()).size).toBe(0);
  });

  it('lee códigos válidos y descarta los desconocidos', async () => {
    mock.local[primed.PRIMED_INDEX_KEY] = { v: 1, e: { '1': 'g', '2': 'zz', '3': 'n' } };
    const map = await primed.loadPrimedIndex();
    expect(map.get('1')).toBe('g');
    expect(map.get('2')).toBeUndefined();
    expect(map.get('3')).toBe('n');
  });
});
