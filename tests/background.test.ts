// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Message-level integration tests of the service worker: allowlist,
// sender validation, queue dedup/cap and the per-origin circuit breaker.
// The worker module is re-imported per test (module-level state).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BREAKER_FAILURES } from '../src/lib/constants';
import { EXTENSION_ID, stubChrome, type ChromeMock, type MessageListener } from './chrome-mock';

const CW_URL = 'https://www.codeweavers.com/compatibility?name=elden';

function okResponse(body = 'html'): Response {
  return {
    ok: true,
    status: 200,
    url: CW_URL,
    headers: { get: () => null },
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

let mock: ChromeMock;

async function loadWorker(): Promise<MessageListener> {
  await import('../src/background');
  return mock.messageListener();
}

/** Drives the listener like chrome would: resolves with the response, or
 * with undefined when the listener refuses the message synchronously. */
function send(listener: MessageListener, msg: unknown, senderId = EXTENSION_ID): Promise<unknown> {
  return new Promise((resolve) => {
    const wantsAsync = listener(msg, { id: senderId }, resolve);
    if (wantsAsync !== true) resolve(undefined);
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mock = stubChrome();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('background extFetch', () => {
  it('ignora mensajes de remitentes ajenos', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const listener = await loadWorker();
    const res = await send(listener, { type: 'extFetch', url: CW_URL }, 'other-extension');
    expect(res).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignora mensajes que no son extFetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const listener = await loadWorker();
    const res = await send(listener, { type: 'other' });
    expect(res).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza URLs fuera de la allowlist sin tocar la red', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const listener = await loadWorker();
    const res = await send(listener, { type: 'extFetch', url: 'https://evil.example.test/x' });
    expect(res).toMatchObject({ ok: false, code: 'not-allowed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('responde con el cuerpo en un fetch correcto', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(okResponse('page'))));
    const listener = await loadWorker();
    const p = send(listener, { type: 'extFetch', url: CW_URL });
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ ok: true, body: 'page' });
  });

  it('dedupe: dos mensajes con la misma URL comparten un solo fetch', async () => {
    let release!: (r: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const listener = await loadWorker();
    const p1 = send(listener, { type: 'extFetch', url: CW_URL });
    const p2 = send(listener, { type: 'extFetch', url: CW_URL });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(okResponse());
    await vi.runAllTimersAsync();
    expect(await p1).toMatchObject({ ok: true });
    expect(await p2).toMatchObject({ ok: true });
  });

  it('limita la concurrencia a 2 fetches simultáneos', async () => {
    const releases: Array<(r: Response) => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(resolve);
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const listener = await loadWorker();
    const urls = ['a', 'b', 'c'].map(
      (q) => `https://www.codeweavers.com/compatibility?name=${q}`,
    );
    const promises = urls.map((url) => send(listener, { type: 'extFetch', url }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    releases[0]?.(okResponse());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    releases[1]?.(okResponse());
    releases[2]?.(okResponse());
    await vi.runAllTimersAsync();
    for (const p of promises) expect(await p).toMatchObject({ ok: true });
  });

  it('abre el breaker tras 5 fallos y falla rápido sin tocar la red', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('network down')));
    vi.stubGlobal('fetch', fetchMock);
    const listener = await loadWorker();
    for (let i = 0; i < BREAKER_FAILURES; i++) {
      const p = send(listener, { type: 'extFetch', url: CW_URL });
      await vi.runAllTimersAsync();
      expect(await p).toMatchObject({ ok: false, code: 'network' });
    }
    const callsBefore = fetchMock.mock.calls.length;
    const p = send(listener, { type: 'extFetch', url: CW_URL });
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ ok: false, code: 'breaker-open' });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});
