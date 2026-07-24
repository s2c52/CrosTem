// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// AppleGamingWiki client: MediaWiki cargoquery API over the
// Compatibility_macOS table (CrossOver / Parallels / native / Rosetta 2
// statuses per game page). Page matching uses the same scoring as
// CodeWeavers; a user correction (choice) always wins.
import * as cache from './cache';
import { fetchExt } from './client';
import { asString, isRecord } from './guards';
import { logDebug } from './log';
import { baseName, rank } from './matcher';
import type { AgwCompat, AgwStatus, CwSearchResult, RankedResult } from '../types';

const AGW_API = 'https://www.applegamingwiki.com/w/api.php';

export function agwPageUrl(page: string): string {
  return 'https://www.applegamingwiki.com/wiki/' + encodeURIComponent(page.replace(/ /g, '_'));
}

export function agwSearchUrl(name: string): string {
  return 'https://www.applegamingwiki.com/w/index.php?' + String(new URLSearchParams({ search: name }));
}

function toStatus(v: string | undefined): AgwStatus {
  const s = (v ?? '').trim().toLowerCase().replace(/[’']/g, "'");
  const known: AgwStatus[] = [
    'perfect',
    'playable',
    'runs',
    'menu',
    'unplayable',
    "doesn't work",
    'na',
  ];
  return (known as string[]).includes(s) ? (s as AgwStatus) : 'unknown';
}

function cargoUrl(where: string, limit: number): string {
  const params = new URLSearchParams({
    action: 'cargoquery',
    tables: 'Compatibility_macOS',
    fields: '_pageName=Page,crossover,parallels,native,rosetta_2',
    where,
    limit: String(limit),
    format: 'json',
  });
  return `${AGW_API}?${params}`;
}

/** Pure parsing of the cargoquery response (testable with fixtures).
 * Rows are validated field by field: the API response is untrusted input. */
export function parseCargoResponse(body: string): AgwCompat[] {
  const json: unknown = JSON.parse(body);
  const rows = isRecord(json) && Array.isArray(json.cargoquery) ? json.cargoquery : [];
  const out: AgwCompat[] = [];
  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.title)) continue;
    const title = row.title;
    const page = title.Page;
    if (typeof page !== 'string') continue;
    out.push({
      page,
      crossover: toStatus(asString(title.crossover)),
      parallels: toStatus(asString(title.parallels)),
      native: toStatus(asString(title.native)),
      rosetta2: toStatus(asString(title['rosetta 2'])),
    });
  }
  return out;
}

async function cargoQuery(where: string, limit: number): Promise<AgwCompat[]> {
  return parseCargoResponse(await fetchExt(cargoUrl(where, limit)));
}

// The cargo where clause is SQL: quotes are stripped and tokens are matched
// with LIKE to dodge escaping and punctuation issues in titles.
function likePattern(name: string): string {
  const tokens = baseName(name).split(' ').filter(Boolean);
  return '%' + tokens.join('%') + '%';
}

/**
 * Where clause for the page search. Wiki page names often omit the
 * subtitle after ':' or ' - ' ("The Witcher 3: Wild Hunt" → page
 * "The Witcher 3"), and a pattern built from the full title can never
 * match those; a second pattern from the pre-subtitle prefix rescues
 * them. rank() still arbitrates every row, so the extra matches cannot
 * cause a wrong auto-pick. Exported for tests.
 */
export function likeWhere(name: string): string {
  const patterns = [likePattern(name)];
  const prefix = name.split(/:|\s+[-–—]\s+/)[0] ?? '';
  const prefixPattern = likePattern(prefix);
  if (prefixPattern !== '%%' && !patterns.includes(prefixPattern)) {
    patterns.push(prefixPattern);
  }
  return patterns.map((p) => `_pageName LIKE ${sqlQuote(p)}`).join(' OR ');
}

/** Quotes a value as a Cargo (SQL) string literal. Backslashes are
 * escaped too: doubling quotes alone leaves `\'` as an escape hatch. */
function sqlQuote(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

export interface AgwLookup {
  result: AgwCompat | null;
  /** Plausible pages (picker fodder for the "wrong match?" correction). */
  candidates: RankedResult[];
}

const EMPTY_LOOKUP: AgwLookup = { result: null, candidates: [] };

/**
 * Looks up a game's AGW compatibility by name, keeping the plausible
 * candidate pages so the widget can offer a correction picker.
 */
export async function agwLookupDetailed(
  name: string,
  appid?: string | null,
  swr?: cache.SwrPass,
): Promise<AgwLookup> {
  const base = baseName(name);
  if (!base) return EMPTY_LOOKUP;

  // User correction (by appid) — the chosen page is stored.
  if (appid) {
    const chosen = await cache.getSourceChoice('agw', appid);
    if (chosen) {
      const rows = await cachedQuery(`_pageName=${sqlQuote(chosen)}`, 1, 'agw:page:' + chosen, swr);
      const row = rows[0];
      if (row) return { result: row, candidates: [] };
    }
  }

  const cacheKey = 'agw:' + base;
  const cached = await cache.getSwr<unknown>(cacheKey, swr);
  if (cached !== undefined) {
    if (isRecord(cached) && 'result' in cached && 'candidates' in cached) {
      return cached as unknown as AgwLookup;
    }
    // Legacy cache entry (bare result, no candidates).
    return { result: cached as AgwCompat | null, candidates: [] };
  }

  let lookup: AgwLookup;
  try {
    const fetched = await cargoQuery(likeWhere(name), 20);
    // The wiki can hold duplicate table rows for one page; deduplicate or
    // two identical top scores would void the lone-confident-match rule.
    const rows = [...new Map(fetched.map((r) => [r.page, r])).values()];
    // Reuses the matcher ranking by treating pages as candidates.
    const asResults: CwSearchResult[] = rows.map((r) => ({
      name: r.page,
      slug: r.page,
      company: '',
      lastUpdated: '',
      stars: null,
    }));
    const ranked = rank(name, asResults);
    // A lone below-confident candidate auto-picks only when the page name
    // extends the query (edition/DLC pages). A *shorter* page is how a
    // prequel surfaces for a sequel query ("Kingdom Come: Deliverance"
    // for "… II" via the prefix pattern), so those stay in the picker.
    const lone = ranked.candidates.length === 1 ? ranked.candidates[0] : null;
    const loneSafe = lone && baseName(lone.name).startsWith(baseName(name)) ? lone : null;
    const pick = ranked.confident ?? loneSafe;
    const result = pick ? (rows.find((r) => r.page === pick.slug) ?? null) : null;
    lookup = { result, candidates: ranked.candidates };
  } catch (e) {
    lookup = EMPTY_LOOKUP; // AGW being down must not break the widget
    logDebug('AGW query failed', e);
  }

  await cache.set(cacheKey, lookup, lookup.result ? await cache.ttlResult() : cache.TTL_NEGATIVE);
  return lookup;
}

/** Result-only variant kept for callers that don't need candidates. */
export async function agwLookup(
  name: string,
  appid?: string | null,
  swr?: cache.SwrPass,
): Promise<AgwCompat | null> {
  return (await agwLookupDetailed(name, appid, swr)).result;
}

async function cachedQuery(
  where: string,
  limit: number,
  key: string,
  swr?: cache.SwrPass,
): Promise<AgwCompat[]> {
  const cached = await cache.getSwr<AgwCompat[]>(key, swr);
  if (cached !== undefined) return cached;
  const rows = await cargoQuery(where, limit);
  await cache.set(key, rows);
  return rows;
}

/** Cache key for selective invalidation (refresh button). */
export function agwCacheKey(name: string): string {
  return 'agw:' + baseName(name);
}
