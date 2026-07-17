// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// High-level client used by the content scripts: fetch (via the service
// worker, which avoids CORS), parsing and caching of CodeWeavers and Steam data.
import * as cache from './cache';
import { MAX_CONCURRENT_FETCHES } from './constants';
import { asString, isRecord } from './guards';
import { logDebug } from './log';
import { baseName } from './matcher';
import { fetchWithPolicy, messageTimeoutMs, sourceTimeoutMs } from './net';
import { parseAppPage, parseSearchResults } from './parser';
import { createFetchQueue } from './queue';
import type {
  CwAppPage,
  CwSearchResult,
  ExtFetchRequest,
  ExtFetchResponse,
  SteamDetails,
} from '../types';

const CW_BASE = 'https://www.codeweavers.com';

/** Message round-trip failed (worker killed, timeout) — retryable,
 * unlike a completed response with ok:false. */
class TransportError extends Error {}

/** The worker's breaker rejected the origin: fail fast, do not retry. */
export class BreakerOpenError extends Error {}

function sendFetchMessage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // MV3 can kill the service worker mid-request, in which case the
    // callback never fires: without this timeout the promise (and the
    // widget behind it) would hang forever. The budget is the worker's
    // worst case (all attempts + waits) so we never give up on a worker
    // that is still legitimately retrying.
    const timer = setTimeout(
      () => reject(new TransportError('extension fetch timed out')),
      messageTimeoutMs(url),
    );
    const msg: ExtFetchRequest = { type: 'extFetch', url };
    chrome.runtime.sendMessage(msg, (res: ExtFetchResponse | undefined) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new TransportError(chrome.runtime.lastError.message));
      } else if (!res) {
        reject(new TransportError('no response from service worker'));
      } else if (!res.ok) {
        reject(res.code === 'breaker-open' ? new BreakerOpenError(res.error) : new Error(res.error));
      } else {
        resolve(res.body);
      }
    });
  });
}

/** Fetch of an external resource through the service worker (avoids CORS).
 * Retries once on transport failures: the worker may have just been
 * restarted by MV3 (its queue state is ephemeral by design). */
export async function fetchExt(url: string): Promise<string> {
  try {
    return await sendFetchMessage(url);
  } catch (e) {
    if (!(e instanceof TransportError)) throw e;
    logDebug('extFetch transport failure, retrying once', e);
    return sendFetchMessage(url);
  }
}

export function searchUrl(query: string): string {
  return CW_BASE + '/compatibility?name=' + encodeURIComponent(query);
}

export function appUrl(slug: string): string {
  return CW_BASE + '/compatibility/crossover/' + encodeURIComponent(slug);
}

// Cache keys exposed for selective invalidation (refresh button).
export function searchCacheKey(name: string): string {
  return 'search:' + baseName(name);
}

export function appCacheKey(slug: string): string {
  return 'app:' + slug;
}

export function steamCacheKey(appid: string): string {
  // "en" marks entries fetched with l=english (name/requirements language
  // affects matching and arch inference); older un-pinned entries are ignored.
  return 'steam:en:' + appid;
}

/** Searches CodeWeavers by (simplified) game name. */
export async function search(name: string): Promise<CwSearchResult[]> {
  const query = baseName(name);
  if (!query) return [];
  const cacheKey = 'search:' + query;
  const cached = await cache.get<CwSearchResult[]>(cacheKey);
  if (cached !== undefined) return cached;

  const html = await fetchExt(searchUrl(query));
  const results = parseSearchResults(html);
  await cache.set(
    cacheKey,
    results,
    results.length === 0 ? cache.TTL_NEGATIVE : await cache.ttlResult(),
  );
  return results;
}

/** Downloads and parses a CodeWeavers app page by slug. */
export async function getApp(slug: string): Promise<CwAppPage | null> {
  const cacheKey = 'app:' + slug;
  const cached = await cache.get<CwAppPage | null>(cacheKey);
  if (cached !== undefined) return cached;

  const html = await fetchExt(appUrl(slug));
  const data = parseAppPage(html);
  await cache.set(cacheKey, data, data ? await cache.ttlResult() : cache.TTL_NEGATIVE);
  return data;
}

// --- Steam appdetails (same origin from store.steampowered.com) ---
// Provides the name and native Mac flag for capsules that only carry an image.
// Throttled and cached long-term because of Steam's rate limit.

const STEAM_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const steamQueue = createFetchQueue<SteamDetails | null>(MAX_CONCURRENT_FETCHES);

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pure parsing of the appdetails response (testable with fixtures).
 * The response is untrusted input: every field is validated, never cast. */
export function parseSteamDetails(json: unknown, appid: string): SteamDetails | null {
  if (!isRecord(json)) return null;
  const entry = json[appid];
  if (!isRecord(entry) || entry.success !== true || !isRecord(entry.data)) return null;
  const data = entry.data;
  const mac = isRecord(data.platforms) && data.platforms.mac === true;
  // mac_requirements comes with the basic filter; Steam sends [] when empty.
  const mr = data.mac_requirements;
  let macRequirements: string | null = null;
  if (mac && isRecord(mr)) {
    const joined = [asString(mr.minimum), asString(mr.recommended)].filter(Boolean).join(' ');
    macRequirements = stripHtml(joined) || null;
  }
  const releaseDate = isRecord(data.release_date) ? asString(data.release_date.date) : undefined;
  const yearMatch = (releaseDate ?? '').match(/\b(19|20)\d{2}\b/);
  return {
    name: asString(data.name) ?? null,
    mac,
    macRequirements,
    releaseYear: yearMatch ? Number(yearMatch[0]) : null,
  };
}

async function fetchSteamDetails(appid: string): Promise<SteamDetails | null> {
  // l=english pins the response language regardless of the user's Steam
  // session: the English name matches the (English) compatibility sources
  // and mac_requirements stays parseable by the arch regexes.
  const url =
    'https://store.steampowered.com/api/appdetails?appids=' +
    encodeURIComponent(appid) +
    '&filters=platforms,basic,release_date&l=english';
  const out = await fetchWithPolicy(url, {
    timeoutMs: sourceTimeoutMs(url),
    credentials: 'same-origin',
  });
  // Errors keep throwing (nothing cached): only a parsed success:false
  // response is a cacheable negative.
  if (!out.ok) throw new Error(out.error);
  const value = parseSteamDetails(JSON.parse(out.body) as unknown, appid);
  await cache.set(steamCacheKey(appid), value, value ? STEAM_TTL : cache.TTL_NEGATIVE);
  return value;
}

/** Name and native Mac flag, or null if Steam does not know the appid. */
export async function steamDetails(appid: string): Promise<SteamDetails | null> {
  const cached = await cache.get<SteamDetails | null>(steamCacheKey(appid));
  if (cached !== undefined) return cached;
  return steamQueue.run(appid, () => fetchSteamDetails(appid));
}
