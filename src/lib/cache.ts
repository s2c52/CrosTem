// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Cache in chrome.storage.local with TTL, plus the persistent map of
// user-confirmed matches (steam appid -> CodeWeavers slug).
// A session-lived in-memory L1 (per context: page or worker) fronts
// storage.local; lifecycle upkeep (expired-entry sweep, quota handling,
// soft-limit eviction) also lives here so callers stay oblivious.

import {
  CACHE_EVICT_TARGET_BYTES,
  CACHE_QUOTA_SOFT_BYTES,
  CACHE_SWEEP_INTERVAL_MS,
} from './constants';
import { logDebug } from './log';
import { getSettings } from './settings';

export const TTL_RESULT = 7 * 24 * 60 * 60 * 1000; // fallback when there are no settings
export const TTL_NEGATIVE = 24 * 60 * 60 * 1000; // "no data" responses: 24 hours

/** Result TTL according to the user's settings (days → ms). */
export async function ttlResult(): Promise<number> {
  try {
    return (await getSettings()).cacheTtlDays * 24 * 60 * 60 * 1000;
  } catch {
    return TTL_RESULT;
  }
}

interface CacheEntry<T> {
  value: T;
  expires: number;
}

// L1: avoids an async storage round-trip for games repeated within the
// page/session. Kept coherent across contexts via storage.onChanged —
// mandatory, because the options page clears the cache with a raw
// chrome.storage.local.remove that never goes through this module.
const l1 = new Map<string, CacheEntry<unknown>>();

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Drop on every change (own writes included): the next get simply
    // repopulates. Cheaper to reason about than diffing newValue.
    for (const k of Object.keys(changes)) {
      if (k.startsWith('cache:')) l1.delete(k);
    }
  });
}

async function storageGet<T>(key: string): Promise<T | undefined> {
  const obj = await chrome.storage.local.get(key);
  return obj[key] as T | undefined;
}

export async function get<T>(key: string): Promise<T | undefined> {
  const storageKey = 'cache:' + key;
  const hit = l1.get(storageKey) as CacheEntry<T> | undefined;
  if (hit) {
    if (Date.now() <= hit.expires) return hit.value;
    l1.delete(storageKey);
    void chrome.storage.local.remove(storageKey);
    return undefined;
  }
  const entry = await storageGet<CacheEntry<T>>(storageKey);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    void chrome.storage.local.remove(storageKey);
    return undefined;
  }
  l1.set(storageKey, entry);
  return entry.value;
}

export async function set<T>(key: string, value: T, ttlMs: number = TTL_RESULT): Promise<void> {
  const storageKey = 'cache:' + key;
  const entry: CacheEntry<T> = { value, expires: Date.now() + ttlMs };
  // The value is valid for this context even if persisting fails below.
  l1.set(storageKey, entry);
  try {
    await chrome.storage.local.set({ [storageKey]: entry });
  } catch (e) {
    // Quota exceeded: make room once and retry; if it still fails the
    // extension just runs uncached (every caller tolerates misses).
    await sweepExpired();
    try {
      await chrome.storage.local.set({ [storageKey]: entry });
    } catch {
      logDebug('cache.set skipped (quota)', e);
    }
  }
}

/** Invalidates specific entries (widget refresh button). */
export async function remove(...keys: string[]): Promise<void> {
  for (const k of keys) l1.delete('cache:' + k);
  await chrome.storage.local.remove(keys.map((k) => 'cache:' + k));
}

/** Removes every expired (or malformed) cache entry. Returns the count. */
export async function sweepExpired(): Promise<number> {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const stale = Object.entries(all)
    .filter(([k, v]) => {
      if (!k.startsWith('cache:')) return false;
      const expires = (v as Partial<CacheEntry<unknown>> | null)?.expires;
      return typeof expires !== 'number' || now > expires;
    })
    .map(([k]) => k);
  if (stale.length > 0) {
    for (const k of stale) l1.delete(k);
    await chrome.storage.local.remove(stale);
  }
  return stale.length;
}

/** When usage exceeds the soft limit, evicts cache entries until the
 * estimated usage drops to the target. Soonest-to-expire go first:
 * `expires` doubles as an age proxy (short-TTL negatives fall before
 * month-long Steam entries), avoiding a schema change to track creation
 * time. Returns the number of evicted entries. */
export async function enforceQuotaSoftLimit(): Promise<number> {
  const used = await chrome.storage.local.getBytesInUse(null);
  if (used <= CACHE_QUOTA_SOFT_BYTES) return 0;
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([k]) => k.startsWith('cache:'))
    .map(([k, v]) => {
      const expires = (v as Partial<CacheEntry<unknown>> | null)?.expires;
      return {
        key: k,
        expires: typeof expires === 'number' ? expires : 0,
        // Estimate (chrome counts key + JSON of the value) so we do not
        // call getBytesInUse in a loop.
        bytes: k.length + JSON.stringify(v).length,
      };
    })
    .sort((a, b) => a.expires - b.expires);
  const doomed: string[] = [];
  let freed = 0;
  for (const e of entries) {
    if (used - freed <= CACHE_EVICT_TARGET_BYTES) break;
    doomed.push(e.key);
    freed += e.bytes;
  }
  if (doomed.length > 0) {
    for (const k of doomed) l1.delete(k);
    await chrome.storage.local.remove(doomed);
  }
  return doomed.length;
}

// Timestamp of the last maintenance run. Deliberately outside the
// `cache:` prefix so the sweep never removes it.
const SWEEP_STAMP_KEY = 'cacheSweepAt';

/** Runs sweep + eviction at most once per interval. Called on every
 * service-worker start (MV3 restarts it constantly, hence the throttle);
 * never throws — maintenance must not break the fetch path. */
export async function maybeDailyMaintenance(): Promise<void> {
  try {
    const stamp = await storageGet<number>(SWEEP_STAMP_KEY);
    const now = Date.now();
    if (typeof stamp === 'number' && now - stamp < CACHE_SWEEP_INTERVAL_MS) return;
    // Stamp before working: a second near-simultaneous worker start
    // should skip (the work itself is idempotent either way).
    await chrome.storage.local.set({ [SWEEP_STAMP_KEY]: now });
    const swept = await sweepExpired();
    const evicted = await enforceQuotaSoftLimit();
    if (swept > 0 || evicted > 0) logDebug('cache maintenance', { swept, evicted });
  } catch (e) {
    logDebug('cache maintenance failed', e);
  }
}

/** Keys in chrome.storage.local starting with the given prefix. */
export async function storageKeys(prefix: string): Promise<string[]> {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith(prefix));
}

// User-confirmed matching corrections, per data source
// ('cw' → CodeWeavers slug, 'agw' → AppleGamingWiki page).
export type MatchSource = 'cw' | 'agw';

export async function getSourceChoice(
  source: MatchSource,
  appid: string,
): Promise<string | undefined> {
  const v = await storageGet<string>(`choice:${source}:${appid}`);
  if (v !== undefined) return v;
  // Legacy key from v0.2/v0.3 (only the CodeWeavers choice existed).
  if (source === 'cw') return storageGet<string>('choice:' + appid);
  return undefined;
}

export async function setSourceChoice(
  source: MatchSource,
  appid: string,
  value: string,
): Promise<void> {
  await chrome.storage.local.set({ [`choice:${source}:${appid}`]: value });
}

export async function clearSourceChoice(source: MatchSource, appid: string): Promise<void> {
  await chrome.storage.local.remove(`choice:${source}:${appid}`);
  if (source === 'cw') await chrome.storage.local.remove('choice:' + appid);
}
