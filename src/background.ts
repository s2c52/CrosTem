// Service worker: hace los fetch a CodeWeavers en nombre de los content
// scripts. Los content scripts no pueden hacer fetch cross-origin (CORS);
// con host_permissions el service worker sí. El HTML vuelve como texto y se
// parsea en el content script, porque DOMParser no existe en service workers.
import type { CwFetchRequest, CwFetchResponse } from './types';

const ALLOWED_HOST = 'www.codeweavers.com';
const ALLOWED_PATH_PREFIX = '/compatibility';
const MAX_CONCURRENT = 2;

let activeCount = 0;
const queue: Array<{ url: string; resolve: (r: CwFetchResponse) => void }> = [];
const inflight = new Map<string, Promise<CwFetchResponse>>();

function pump(): void {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    activeCount++;
    doFetch(job.url)
      .then(job.resolve, job.resolve)
      .finally(() => {
        activeCount--;
        inflight.delete(job.url);
        pump();
      });
  }
}

async function doFetch(url: string): Promise<CwFetchResponse> {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, html: await res.text(), finalUrl: res.url };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

function enqueueFetch(url: string): Promise<CwFetchResponse> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.resolve({ ok: false, error: 'Invalid URL' });
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== ALLOWED_HOST ||
      !parsed.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
    return Promise.resolve({ ok: false, error: 'URL not allowed' });
  }
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = new Promise<CwFetchResponse>((resolve) => {
    queue.push({ url, resolve });
    pump();
  });
  inflight.set(url, p);
  return p;
}

chrome.runtime.onMessage.addListener((msg: CwFetchRequest, _sender, sendResponse) => {
  if (msg?.type === 'cwFetch' && typeof msg.url === 'string') {
    void enqueueFetch(msg.url).then(sendResponse);
    return true; // respuesta asíncrona
  }
  return false;
});
