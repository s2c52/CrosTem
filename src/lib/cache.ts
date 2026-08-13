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
  CACHE_STALE_WINDOW_MS,
  CACHE_SWEEP_INTERVAL_MS,
  CACHE_WRITE_COALESCE_MS,
  CACHE_WRITE_FLUSH_MAX,
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

// Own-write ledger: with writes coalesced (below), one storage.set fires a
// single onChanged carrying every key of the batch — in this context too.
// Evicting on our own echo would guarantee an L1 miss right after every
// write, so the flush records `expires` per key and the listener keeps the
// entry when the incoming value matches. `expires` is minted here at set()
// time; a foreign write echoing the identical millisecond would carry data
// exactly as fresh, so keeping ours is safe. Capped because the desktop
// shim never echoes cache writes back (consume-on-event never runs there).
const OWN_WRITE_LEDGER_MAX = 512;
const ownWrites = new Map<string, number>();

function recordOwnWrite(storageKey: string, expires: number): void {
  ownWrites.delete(storageKey);
  ownWrites.set(storageKey, expires);
  if (ownWrites.size > OWN_WRITE_LEDGER_MAX) {
    const oldest = ownWrites.keys().next().value;
    if (oldest !== undefined) ownWrites.delete(oldest);
  }
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const k of Object.keys(changes)) {
      if (!k.startsWith('cache:')) continue;
      const own = ownWrites.get(k);
      const incoming = changes[k]?.newValue as Partial<CacheEntry<unknown>> | undefined;
      if (own !== undefined && incoming?.expires === own) {
        // Our own flushed write echoing back: L1 already holds exactly
        // this entry; evicting would send the next read to storage.
        ownWrites.delete(k);
        continue;
      }
      // Foreign write or removal (no newValue): drop the L1 copy AND any
      // pending write of ours, so a late flush cannot overwrite fresher
      // foreign data or resurrect an entry the user just cleared.
      l1.delete(k);
      pendingWrites?.items.delete(k);
    }
  });
}

interface GetWaiter {
  keys: string[];
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: unknown) => void;
}

interface GetBatch {
  keys: Set<string>;
  waiters: GetWaiter[];
}

let pendingGet: GetBatch | null = null;

// Coalesce keyed gets landing in the same microtask window into ONE
// storage.local.get. A screenful of badges released by the observer fires
// dozens of near-simultaneous reads (cache probes, correction lookups);
// the burst is synchronous, so a microtask flush catches all of it with no
// added latency. Whole-area gets (null) stay unbatched: merging them would
// answer keyed callers with the entire area.
function batchedLocalGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let batch = pendingGet;
    if (!batch) {
      const opened: GetBatch = { keys: new Set(), waiters: [] };
      batch = opened;
      pendingGet = opened;
      // Pinned like WriteBatch.area: the flush must hit the storage the
      // callers saw, even if the global changes underneath (tests).
      const area = chrome.storage.local;
      queueMicrotask(() => {
        pendingGet = null;
        area.get([...opened.keys]).then(
          (all) => {
            for (const waiter of opened.waiters) {
              // Slice per caller, present keys only — chrome.storage.get
              // omits keys that do not exist.
              const out: Record<string, unknown> = {};
              for (const key of waiter.keys) {
                if (key in all) out[key] = all[key];
              }
              waiter.resolve(out);
            }
          },
          (error: unknown) => {
            for (const waiter of opened.waiters) waiter.reject(error);
          },
        );
      });
    }
    for (const key of keys) batch.keys.add(key);
    batch.waiters.push({ keys, resolve, reject });
  });
}

async function storageGet<T>(key: string): Promise<T | undefined> {
  const obj = await batchedLocalGet([key]);
  return obj[key] as T | undefined;
}

/** Stale-while-revalidate pass marker. Hand the same object to every
 * source lookup of one resolution: it comes back with `staleServed`
 * true when any served entry was past its TTL (still inside the stale
 * window), meaning the caller should revalidate in the background. */
export interface SwrPass {
  staleServed: boolean;
}

async function readEntry<T>(storageKey: string): Promise<CacheEntry<T> | undefined> {
  const hit = l1.get(storageKey) as CacheEntry<T> | undefined;
  if (hit) return hit;
  const entry = await storageGet<CacheEntry<T>>(storageKey);
  if (entry) l1.set(storageKey, entry);
  return entry;
}

/**
 * Strict read: only entries within their TTL. Expired entries inside the
 * stale window are KEPT in storage (getSwr may still serve them, and if
 * the refresh fails they remain the best data available); only entries
 * past the window are dropped.
 */
export async function get<T>(key: string): Promise<T | undefined> {
  return getSwr<T>(key);
}

/** Like get(), but with a SwrPass it also serves expired entries inside
 * the stale window, flagging the pass so the caller revalidates. */
export async function getSwr<T>(key: string, swr?: SwrPass): Promise<T | undefined> {
  const storageKey = 'cache:' + key;
  const entry = await readEntry<T>(storageKey);
  if (!entry) return undefined;
  const now = Date.now();
  if (now <= entry.expires) return entry.value;
  if (now > entry.expires + CACHE_STALE_WINDOW_MS) {
    l1.delete(storageKey);
    void chrome.storage.local.remove(storageKey);
    return undefined;
  }
  if (swr) {
    swr.staleServed = true;
    return entry.value;
  }
  return undefined;
}

interface WriteBatch {
  items: Map<string, CacheEntry<unknown>>;
  // Pinned at scheduling time so the flush always lands on the storage
  // the writer saw, even if the global changes underneath (tests).
  area: typeof chrome.storage.local;
}

let pendingWrites: WriteBatch | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleWrite(storageKey: string, entry: CacheEntry<unknown>): void {
  let batch = pendingWrites;
  if (!batch) {
    batch = { items: new Map(), area: chrome.storage.local };
    pendingWrites = batch;
  }
  batch.items.set(storageKey, entry);
  if (batch.items.size >= CACHE_WRITE_FLUSH_MAX) {
    void flushWrites();
  } else if (writeTimer === null) {
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void flushWrites();
    }, CACHE_WRITE_COALESCE_MS);
  }
}

async function flushWrites(): Promise<void> {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  const batch = pendingWrites;
  pendingWrites = null;
  if (!batch || batch.items.size === 0) return;
  const items: Record<string, CacheEntry<unknown>> = {};
  for (const [k, v] of batch.items) {
    items[k] = v;
    recordOwnWrite(k, v.expires);
  }
  try {
    await batch.area.set(items);
  } catch (e) {
    // Quota exceeded: make room once and retry the whole batch; if it
    // still fails the extension just runs uncached for these entries
    // (they survive in L1 and every caller tolerates misses).
    try {
      await sweepExpired();
      await batch.area.set(items);
    } catch {
      logDebug('cache flush skipped (quota)', e);
      for (const [k, v] of batch.items) {
        if (ownWrites.get(k) === v.expires) ownWrites.delete(k);
      }
    }
  }
}

export async function set<T>(key: string, value: T, ttlMs: number = TTL_RESULT): Promise<void> {
  const storageKey = 'cache:' + key;
  const entry: CacheEntry<T> = { value, expires: Date.now() + ttlMs };
  // The value is valid for this context even if persisting fails later.
  l1.set(storageKey, entry);
  // Persistence is coalesced (see WriteBatch). Resolving at schedule time
  // keeps resolution paths — which await set() — off the flush window;
  // cross-context readers lag by at most that window, well inside the SWR
  // staleness contract.
  scheduleWrite(storageKey, entry);
}

/** Invalidates specific entries (widget refresh button). */
export async function remove(...keys: string[]): Promise<void> {
  const storageKeys = keys.map((k) => 'cache:' + k);
  for (const k of storageKeys) {
    l1.delete(k);
    // A pending write must not outlive the removal: a late flush would
    // resurrect the entry this caller just invalidated (widget refresh
    // is remove -> re-resolve).
    pendingWrites?.items.delete(k);
    ownWrites.delete(k);
  }
  await chrome.storage.local.remove(storageKeys);
}

/** Removes every cache entry past its stale window (or malformed).
 * Entries merely past their TTL stay: they are SWR fodder. Returns the
 * count of removed entries. */
export async function sweepExpired(): Promise<number> {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const stale = Object.entries(all)
    .filter(([k, v]) => {
      if (!k.startsWith('cache:')) return false;
      const expires = (v as Partial<CacheEntry<unknown>> | null)?.expires;
      return typeof expires !== 'number' || now > expires + CACHE_STALE_WINDOW_MS;
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
