// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Client-side failure damping: the per-URL failure memo of fetchExt and
// the dedicated breaker of the direct Steam appdetails fetch. Modules
// are re-imported per test (both keep module-level state).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BREAKER_FAILURES, FETCH_FAILURE_MEMO_MS } from '../src/lib/constants';
import { stubChrome, type ChromeMock } from './chrome-mock';

let mock: ChromeMock;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mock = stubChrome();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchExt failure memo', () => {
  it('tras un fallo, la misma URL falla al instante sin ir al worker', async () => {
    const handler = vi.fn(() => ({ ok: false, error: 'HTTP 500', code: 'http', status: 500 }));
    mock.onSendMessage(handler);
    const { fetchExt } = await import('../src/lib/client');

    await expect(fetchExt('https://www.codeweavers.com/compatibility?name=a')).rejects.toThrow(
      'HTTP 500',
    );
    const calls = handler.mock.calls.length;
    await expect(fetchExt('https://www.codeweavers.com/compatibility?name=a')).rejects.toThrow(
      'cooling down',
    );
    expect(handler.mock.calls.length).toBe(calls); // no new round-trip
  });

  it('el memo expira y un éxito lo limpia', async () => {
    let fail = true;
    mock.onSendMessage(() =>
      fail
        ? { ok: false, error: 'HTTP 500', code: 'http', status: 500 }
        : { ok: true, body: 'html', finalUrl: 'https://x/' },
    );
    const { fetchExt } = await import('../src/lib/client');
    const url = 'https://www.codeweavers.com/compatibility?name=b';

    await expect(fetchExt(url)).rejects.toThrow('HTTP 500');
    fail = false;
    vi.advanceTimersByTime(FETCH_FAILURE_MEMO_MS + 1);
    await expect(fetchExt(url)).resolves.toBe('html');
    // Cleared: an immediate re-fetch goes through again.
    await expect(fetchExt(url)).resolves.toBe('html');
  });
});

describe('steam appdetails breaker', () => {
  it('abre tras fallos consecutivos y corta sin tocar la red', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404, // no retries: one attempt = one final failure
        url: 'https://store.steampowered.com/x',
        headers: { get: () => null },
        text: () => Promise.resolve(''),
      } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { steamDetails } = await import('../src/lib/client');

    for (let i = 0; i < BREAKER_FAILURES; i++) {
      // Attach the expectation before advancing timers so the rejection
      // is never momentarily unhandled.
      const expectation = expect(steamDetails(String(1000 + i))).rejects.toThrow('HTTP 404');
      await vi.runAllTimersAsync();
      await expectation;
    }
    const callsBefore = fetchMock.mock.calls.length;
    const expectation = expect(steamDetails('2000')).rejects.toThrow('circuit open');
    await vi.runAllTimersAsync();
    await expectation;
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});
