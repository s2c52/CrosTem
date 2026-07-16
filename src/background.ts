// Service worker: hace los fetch externos en nombre de los content scripts
// (que no pueden hacer fetch cross-origin por CORS; con host_permissions el
// service worker sí). El cuerpo vuelve como texto y se parsea en el content
// script (DOMParser no existe en service workers; JSON.parse da igual dónde).
import type { ExtFetchRequest, ExtFetchResponse } from './types';

// Allowlist estricta de recursos externos consultables.
const ALLOWED: Array<{ host: string; pathPrefix: string }> = [
  { host: 'www.codeweavers.com', pathPrefix: '/compatibility' },
  { host: 'www.applegamingwiki.com', pathPrefix: '/w/api.php' },
  { host: 'raw.githubusercontent.com', pathPrefix: '/AreWeAntiCheatYet/' },
];

const MAX_CONCURRENT = 2;

let activeCount = 0;
const queue: Array<{ url: string; resolve: (r: ExtFetchResponse) => void }> = [];
const inflight = new Map<string, Promise<ExtFetchResponse>>();

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

async function doFetch(url: string): Promise<ExtFetchResponse> {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, body: await res.text(), finalUrl: res.url };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

function enqueueFetch(url: string): Promise<ExtFetchResponse> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.resolve({ ok: false, error: 'Invalid URL' });
  }
  const allowed = parsed.protocol === 'https:' && ALLOWED.some(
    (a) => parsed.hostname === a.host && parsed.pathname.startsWith(a.pathPrefix),
  );
  if (!allowed) return Promise.resolve({ ok: false, error: 'URL not allowed' });

  const existing = inflight.get(url);
  if (existing) return existing;
  const p = new Promise<ExtFetchResponse>((resolve) => {
    queue.push({ url, resolve });
    pump();
  });
  inflight.set(url, p);
  return p;
}

chrome.runtime.onMessage.addListener((msg: ExtFetchRequest, _sender, sendResponse) => {
  if (msg?.type === 'extFetch' && typeof msg.url === 'string') {
    void enqueueFetch(msg.url).then(sendResponse);
    return true; // respuesta asíncrona
  }
  return false;
});
