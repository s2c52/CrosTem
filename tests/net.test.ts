// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FETCH_MAX_RETRIES,
  FETCH_TIMEOUT_DEFAULT_MS,
  RETRY_AFTER_CAP_MS,
} from '../src/lib/constants';
import { fetchWithPolicy, messageTimeoutMs, sourceTimeoutMs } from '../src/lib/net';

function res(status: number, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'https://example.test/final',
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve('body'),
  } as unknown as Response;
}

type FetchMock = ReturnType<typeof vi.fn> & typeof fetch;

function asFetch(fn: ReturnType<typeof vi.fn>): FetchMock {
  return fn as FetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sourceTimeoutMs', () => {
  it('mapea el timeout por host con fallback por defecto', () => {
    expect(sourceTimeoutMs('https://store.steampowered.com/api/appdetails')).toBe(5_000);
    expect(sourceTimeoutMs('https://www.codeweavers.com/compatibility')).toBe(8_000);
    expect(sourceTimeoutMs('https://www.applegamingwiki.com/w/api.php')).toBe(8_000);
    expect(sourceTimeoutMs('https://raw.githubusercontent.com/AreWeAntiCheatYet/x')).toBe(15_000);
    expect(sourceTimeoutMs('https://other.example.test/')).toBe(FETCH_TIMEOUT_DEFAULT_MS);
    expect(sourceTimeoutMs('not a url')).toBe(FETCH_TIMEOUT_DEFAULT_MS);
  });
});

describe('messageTimeoutMs', () => {
  it('cubre el peor caso del worker (todos los intentos + esperas)', () => {
    const url = 'https://raw.githubusercontent.com/AreWeAntiCheatYet/x';
    const worstCase =
      (FETCH_MAX_RETRIES + 1) * sourceTimeoutMs(url) + FETCH_MAX_RETRIES * RETRY_AFTER_CAP_MS;
    expect(messageTimeoutMs(url)).toBeGreaterThan(worstCase);
  });
});

describe('fetchWithPolicy', () => {
  it('aborta un intento colgado al cumplirse el timeout', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const p = fetchWithPolicy('https://example.test/', {
      timeoutMs: 5_000,
      maxRetries: 0,
      fetchFn: asFetch(fetchFn),
    });
    await vi.advanceTimersByTimeAsync(5_000);
    const out = await p;
    expect(out).toMatchObject({ ok: false, code: 'timeout' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reintenta 5xx con backoff exponencial (sin jitter con rand=0)', async () => {
    const start = Date.now();
    const times: number[] = [];
    let call = 0;
    const fetchFn = vi.fn(() => {
      times.push(Date.now() - start);
      call++;
      return Promise.resolve(call < 3 ? res(500) : res(200));
    });
    const p = fetchWithPolicy('https://example.test/', {
      timeoutMs: 5_000,
      fetchFn: asFetch(fetchFn),
      rand: () => 0,
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out.ok).toBe(true);
    // Attempt at t=0, retry after 500ms, second retry after another 1000ms.
    expect(times).toEqual([0, 500, 1_500]);
  });

  it('aplica jitter al backoff usando rand inyectado', async () => {
    const start = Date.now();
    const times: number[] = [];
    let call = 0;
    const fetchFn = vi.fn(() => {
      times.push(Date.now() - start);
      call++;
      return Promise.resolve(call < 2 ? res(500) : res(200));
    });
    const p = fetchWithPolicy('https://example.test/', {
      timeoutMs: 5_000,
      fetchFn: asFetch(fetchFn),
      rand: () => 1,
    });
    await vi.runAllTimersAsync();
    await p;
    expect(times).toEqual([0, 750]); // 500 backoff + 250 full jitter
  });

  it('respeta Retry-After acotado por el cap', async () => {
    const start = Date.now();
    const times: number[] = [];
    let call = 0;
    const fetchFn = vi.fn(() => {
      times.push(Date.now() - start);
      call++;
      return Promise.resolve(call < 2 ? res(429, { 'retry-after': '30' }) : res(200));
    });
    const p = fetchWithPolicy('https://example.test/', {
      timeoutMs: 5_000,
      fetchFn: asFetch(fetchFn),
      rand: () => 0,
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out.ok).toBe(true);
    expect(times).toEqual([0, RETRY_AFTER_CAP_MS]); // 30s capped to 10s
  });

  it('no reintenta 4xx distintos de 429', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(res(404)));
    const p = fetchWithPolicy('https://example.test/', {
      timeoutMs: 5_000,
      fetchFn: asFetch(fetchFn),
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out).toMatchObject({ ok: false, code: 'http', status: 404 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('recupera tras un fallo de red en el primer intento', async () => {
    let call = 0;
    const fetchFn = vi.fn(() => {
      call++;
      return call < 2 ? Promise.reject(new TypeError('network down')) : Promise.resolve(res(200));
    });
    const p = fetchWithPolicy('https://example.test/', {
      timeoutMs: 5_000,
      fetchFn: asFetch(fetchFn),
      rand: () => 0,
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out).toMatchObject({ ok: true, body: 'body' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('agota los reintentos y devuelve el último error', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('network down')));
    const p = fetchWithPolicy('https://example.test/', {
      timeoutMs: 5_000,
      fetchFn: asFetch(fetchFn),
      rand: () => 0,
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out).toMatchObject({ ok: false, code: 'network' });
    expect(fetchFn).toHaveBeenCalledTimes(FETCH_MAX_RETRIES + 1);
  });
});
