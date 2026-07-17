// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Service worker: performs external fetches on behalf of the content scripts
// (which cannot do cross-origin fetches due to CORS; with host_permissions the
// service worker can). The body comes back as text and is parsed in the content
// script (DOMParser does not exist in service workers; JSON.parse works anywhere).
import { isAllowedUrl } from './lib/allowlist';
import { createBreaker } from './lib/breaker';
import { maybeDailyMaintenance } from './lib/cache';
import { MAX_CONCURRENT_FETCHES } from './lib/constants';
import { isExtFetchRequest } from './lib/guards';
import { fetchWithPolicy, sourceTimeoutMs } from './lib/net';
import { createFetchQueue } from './lib/queue';
import type { ExtFetchResponse } from './types';

// Queue and breaker state is module-level and therefore ephemeral: MV3
// may kill the service worker at any time. That is fine — pending
// sendMessage calls fail on the content-script side and are retried
// there, and the breaker simply re-learns a downed origin.
const queue = createFetchQueue<ExtFetchResponse>(MAX_CONCURRENT_FETCHES);
const breaker = createBreaker();

// Cache upkeep on every cold start of the worker, throttled internally
// to once per day. Replaces a chrome.alarms schedule (no extra permission).
void maybeDailyMaintenance();

async function doFetch(url: string): Promise<ExtFetchResponse> {
  // Retries happen inside the queue slot, so a downed origin can hold a
  // slot for the whole retry budget; the breaker caps that exposure.
  const out = await fetchWithPolicy(url, {
    timeoutMs: sourceTimeoutMs(url),
    credentials: 'omit',
  });
  const origin = new URL(url).origin;
  if (out.ok) breaker.onSuccess(origin);
  else breaker.onFailure(origin);
  return out;
}

function enqueueFetch(url: string): Promise<ExtFetchResponse> {
  if (!isAllowedUrl(url)) {
    return Promise.resolve({ ok: false, error: 'URL not allowed', code: 'not-allowed' });
  }
  const origin = new URL(url).origin;
  if (!breaker.allow(origin)) {
    // Fail fast without occupying a queue slot: the sources already
    // degrade gracefully on the content-script side.
    return Promise.resolve({
      ok: false,
      error: `circuit open for ${origin}`,
      code: 'breaker-open',
    });
  }
  return queue.run(url, () => doFetch(url));
}

// First install: open the welcome page (tabs.create needs no permission).
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
  }
});

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  // Defense in depth: only our own content scripts/pages may request
  // fetches (the URL allowlist limits impact either way).
  if (sender.id !== chrome.runtime.id) return false;
  if (!isExtFetchRequest(msg)) return false;
  void enqueueFetch(msg.url).then(sendResponse);
  return true; // asynchronous response
});
