// Service worker: fetches CodeWeavers pages on behalf of content scripts.
// Content scripts cannot fetch cross-origin (CORS); with host_permissions the
// service worker can. HTML is returned as text and parsed in the content
// script, because DOMParser is not available in service workers.

const ALLOWED_HOST = 'www.codeweavers.com';
const ALLOWED_PATH_PREFIX = '/compatibility';
const MAX_CONCURRENT = 2;

let activeCount = 0;
const queue = [];
const inflight = new Map(); // url -> Promise<result>

function pump() {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
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

async function doFetch(url) {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    return { ok: true, html, finalUrl: res.url };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function enqueueFetch(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return Promise.resolve({ ok: false, error: 'Invalid URL' });
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== ALLOWED_HOST ||
      !parsed.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
    return Promise.resolve({ ok: false, error: 'URL not allowed' });
  }
  if (inflight.has(url)) return inflight.get(url);
  const p = new Promise((resolve) => {
    queue.push({ url, resolve });
    pump();
  });
  inflight.set(url, p);
  return p;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'cwFetch' && typeof msg.url === 'string') {
    enqueueFetch(msg.url).then(sendResponse);
    return true; // async response
  }
  return false;
});
