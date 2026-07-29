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

describe('SWR en client.search', () => {
  it('sirve la entrada vencida al instante y la pasada estricta refetchea', async () => {
    const handler = vi.fn(() => ({ ok: true, body: '<html></html>', finalUrl: 'https://x/' }));
    mock.onSendMessage(handler);
    const { search } = await import('../src/lib/client');

    // Populate the cache (empty results → negative TTL, 24h).
    await search('Elden Ring');
    const callsAfterSeed = handler.mock.calls.length;

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1); // expired, inside stale window
    const swr = { staleServed: false };
    await expect(search('Elden Ring', swr)).resolves.toEqual([]);
    expect(swr.staleServed).toBe(true);
    expect(handler.mock.calls.length).toBe(callsAfterSeed); // served without network

    // Strict pass (no SwrPass): the expired entry is refetched.
    await search('Elden Ring');
    expect(handler.mock.calls.length).toBeGreaterThan(callsAfterSeed);
  });
});

describe('steam appdetails breaker', () => {
  it('abre tras fallos consecutivos y corta sin tocar la red', async () => {
    // The dedicated breaker guards the direct same-origin fetch, which
    // only happens on the store surfaces.
    vi.stubGlobal('location', { origin: 'https://store.steampowered.com' });
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

// The library surface runs on steamcommunity.com, where appdetails is
// cross-origin: a direct fetch would be blocked by CORS, so it has to be
// proxied by the service worker (which holds the host permission).
describe('steam appdetails fuera del origen de la tienda', () => {
  const body = JSON.stringify({
    '620': { success: true, data: { name: 'Portal 2', platforms: { mac: true } } },
  });

  /** Records the URLs the worker is asked to fetch. */
  function recordingHandler(): { urls: string[]; handler: (msg: unknown) => unknown } {
    const urls: string[] = [];
    return {
      urls,
      handler: (msg: unknown) => {
        urls.push((msg as { url: string }).url);
        return { ok: true, body, finalUrl: 'https://store.steampowered.com/' };
      },
    };
  }

  it('sale por el service worker y no toca fetch directo', async () => {
    vi.stubGlobal('location', { origin: 'https://steamcommunity.com' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { urls, handler } = recordingHandler();
    mock.onSendMessage(handler);
    const { steamDetails } = await import('../src/lib/client');

    const details = steamDetails('620');
    await vi.runAllTimersAsync();
    await expect(details).resolves.toMatchObject({ name: 'Portal 2', mac: true });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(urls[0]).toContain('store.steampowered.com/api/appdetails');
    expect(urls[0]).toContain('appids=620');
    expect(urls[0]).toContain('l=english');
  });

  it('la URL que pide es una que el allowlist acepta', async () => {
    vi.stubGlobal('location', { origin: 'https://steamcommunity.com' });
    vi.stubGlobal('fetch', vi.fn());
    const { urls, handler } = recordingHandler();
    mock.onSendMessage(handler);
    const { steamDetails } = await import('../src/lib/client');
    const { isAllowedUrl } = await import('../src/lib/allowlist');

    const details = steamDetails('620');
    await vi.runAllTimersAsync();
    await details;

    expect(isAllowedUrl(urls[0] ?? '')).toBe(true);
  });
});
