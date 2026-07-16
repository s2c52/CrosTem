// High-level client used by the content scripts: fetch (via the service
// worker, which avoids CORS), parsing and caching of CodeWeavers and Steam data.
import * as cache from './cache';
import { baseName } from './matcher';
import { parseAppPage, parseSearchResults } from './parser';
import type { CwAppPage, CwSearchResult, ExtFetchRequest, ExtFetchResponse, SteamDetails } from '../types';

const CW_BASE = 'https://www.codeweavers.com';

/** Fetch of an external resource through the service worker (avoids CORS). */
export function fetchExt(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const msg: ExtFetchRequest = { type: 'extFetch', url };
    chrome.runtime.sendMessage(msg, (res: ExtFetchResponse | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!res || !res.ok) {
        reject(new Error(res && !res.ok ? res.error : 'fetch failed'));
      } else {
        resolve(res.body);
      }
    });
  });
}

const fetchHtml = fetchExt;

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
  return 'steam:' + appid;
}

/** Searches CodeWeavers by (simplified) game name. */
export async function search(name: string): Promise<CwSearchResult[]> {
  const query = baseName(name);
  if (!query) return [];
  const cacheKey = 'search:' + query;
  const cached = await cache.get<CwSearchResult[]>(cacheKey);
  if (cached !== undefined) return cached;

  const html = await fetchHtml(searchUrl(query));
  const results = parseSearchResults(html);
  await cache.set(cacheKey, results, results.length === 0 ? cache.TTL_NEGATIVE : await cache.ttlResult());
  return results;
}

/** Downloads and parses a CodeWeavers app page by slug. */
export async function getApp(slug: string): Promise<CwAppPage | null> {
  const cacheKey = 'app:' + slug;
  const cached = await cache.get<CwAppPage | null>(cacheKey);
  if (cached !== undefined) return cached;

  const html = await fetchHtml(appUrl(slug));
  const data = parseAppPage(html);
  await cache.set(cacheKey, data, data ? await cache.ttlResult() : cache.TTL_NEGATIVE);
  return data;
}

// --- Steam appdetails (same origin from store.steampowered.com) ---
// Provides the name and native Mac flag for capsules that only carry an image.
// Throttled and cached long-term because of Steam's rate limit.

const STEAM_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const STEAM_MAX_CONCURRENT = 2;
let steamActive = 0;
const steamQueue: Array<{
  appid: string;
  resolve: (v: SteamDetails | null) => void;
  reject: (e: unknown) => void;
}> = [];
const steamInflight = new Map<string, Promise<SteamDetails | null>>();

function steamPump(): void {
  while (steamActive < STEAM_MAX_CONCURRENT && steamQueue.length > 0) {
    const job = steamQueue.shift()!;
    steamActive++;
    fetchSteamDetails(job.appid)
      .then(job.resolve, job.reject)
      .finally(() => {
        steamActive--;
        steamInflight.delete(job.appid);
        steamPump();
      });
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Pure parsing of the appdetails response (testable with fixtures). */
export function parseSteamDetails(json: unknown, appid: string): SteamDetails | null {
  const entry = (json as Record<string, { success?: boolean; data?: Record<string, unknown> } | undefined>)?.[appid];
  if (!entry?.success || !entry.data) return null;
  const data = entry.data;
  const mac = !!(data.platforms as { mac?: boolean } | undefined)?.mac;
  // mac_requirements comes with the basic filter; Steam sends [] when empty.
  const mr = data.mac_requirements as { minimum?: string; recommended?: string } | unknown[] | undefined;
  const macRequirements = mac && mr && !Array.isArray(mr)
    ? stripHtml([mr.minimum, mr.recommended].filter(Boolean).join(' ')) || null
    : null;
  const yearMatch = String((data.release_date as { date?: string } | undefined)?.date ?? '')
    .match(/\b(19|20)\d{2}\b/);
  return {
    name: (data.name as string | undefined) ?? null,
    mac,
    macRequirements,
    releaseYear: yearMatch ? Number(yearMatch[0]) : null,
  };
}

async function fetchSteamDetails(appid: string): Promise<SteamDetails | null> {
  const url = 'https://store.steampowered.com/api/appdetails?appids=' +
    encodeURIComponent(appid) + '&filters=platforms,basic,release_date';
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const value = parseSteamDetails(await res.json(), appid);
  await cache.set('steam:' + appid, value, value ? STEAM_TTL : cache.TTL_NEGATIVE);
  return value;
}

/** Name and native Mac flag, or null if Steam does not know the appid. */
export async function steamDetails(appid: string): Promise<SteamDetails | null> {
  const cached = await cache.get<SteamDetails | null>('steam:' + appid);
  if (cached !== undefined) return cached;
  const existing = steamInflight.get(appid);
  if (existing) return existing;
  const p = new Promise<SteamDetails | null>((resolve, reject) => {
    steamQueue.push({ appid, resolve, reject });
    steamPump();
  });
  steamInflight.set(appid, p);
  return p;
}
