// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// AreWeAntiCheatYet client: games.json (published on GitHub) with the
// anticheat status per game, including the Steam appid. The data is for
// Linux/Proton — for CrossOver it is indicative, and presented as such.
// The dataset (~460KB) is downloaded whole, reduced to a compact index
// (appid and normalized name) and cached for 7 days.
import * as cache from './cache';
import { fetchExt } from './client';
import { isRecord } from './guards';
import { logDebug } from './log';
import { baseName, normalizeName } from './matcher';
import type { AnticheatInfo, AnticheatNote, AnticheatStatus } from '../types';

const AWACY_URL =
  'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json';
export const AWACY_SITE = 'https://areweanticheatyet.com/';

interface AwacyIndex {
  bySteamId: Record<string, AnticheatInfo>;
  byName: Record<string, AnticheatInfo>;
  /** Same entries keyed by edition-stripped name ("grand theft auto v"),
   * so store variants ("… Enhanced") inherit the dataset's entry. */
  byBaseName: Record<string, AnticheatInfo>;
}

const STATUSES: readonly AnticheatStatus[] = [
  'Supported',
  'Running',
  'Planned',
  'Broken',
  'Denied',
];

function toAnticheatStatus(v: unknown): AnticheatStatus | null {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v)
    ? (v as AnticheatStatus)
    : null;
}

/** Parses the raw per-game notes: `[text, reference | null]` tuples. Untrusted
 * input — entries without text are dropped, and the reference is kept only if
 * it is an http(s) URL so a hostile `javascript:`/`data:` link can never become
 * clickable. */
function toNotes(v: unknown): AnticheatNote[] {
  if (!Array.isArray(v)) return [];
  const out: AnticheatNote[] = [];
  for (const entry of v) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !entry[0]) continue;
    const rawRef: unknown = entry[1];
    const ref = typeof rawRef === 'string' && /^https?:\/\//i.test(rawRef) ? rawRef : null;
    out.push({ text: entry[0], ref });
  }
  return out;
}

/** Builds the index from the raw games.json entries. The dataset is
 * untrusted input: entries are validated field by field and unknown
 * statuses are dropped rather than flowing into the verdict. */
export function buildIndex(games: unknown[]): AwacyIndex {
  const index: AwacyIndex = { bySteamId: {}, byName: {}, byBaseName: {} };
  for (const g of games) {
    if (!isRecord(g) || typeof g.name !== 'string' || !g.name) continue;
    const status = toAnticheatStatus(g.status);
    if (!status) continue;
    const info: AnticheatInfo = {
      name: g.name,
      status,
      anticheats: Array.isArray(g.anticheats)
        ? g.anticheats.filter((a): a is string => typeof a === 'string')
        : [],
    };
    // Attach notes only when present, so note-less games keep the compact shape.
    const notes = toNotes(g.notes);
    if (notes.length) info.notes = notes;
    const steamId = isRecord(g.storeIds) ? g.storeIds.steam : undefined;
    if (typeof steamId === 'string' && steamId) index.bySteamId[steamId] = info;
    index.byName[normalizeName(g.name)] = info;
    // When several names share a base ("X" and "X Enhanced"), the
    // suffix-less entry claims the slot regardless of dataset order.
    const base = baseName(g.name);
    if (!(base in index.byBaseName) || base === normalizeName(g.name)) {
      index.byBaseName[base] = info;
    }
  }
  return index;
}

async function getIndex(swr?: cache.SwrPass): Promise<AwacyIndex | null> {
  const cached = await cache.getSwr<AwacyIndex>('awacy:index', swr);
  if (cached !== undefined) {
    if (!cached) return cached;
    // Indexes cached by older builds predate byBaseName; patch the shape.
    return { ...cached, byBaseName: (cached as Partial<AwacyIndex>).byBaseName ?? {} };
  }
  try {
    const body = await fetchExt(AWACY_URL);
    const parsed: unknown = JSON.parse(body);
    const index = buildIndex(Array.isArray(parsed) ? parsed : []);
    await cache.set('awacy:index', index, await cache.ttlResult());
    return index;
  } catch (e) {
    // AWACY down: no anticheat data, the verdict keeps working.
    logDebug('AWACY index unavailable', e);
    await cache.set('awacy:index', null, cache.TTL_NEGATIVE);
    return null;
  }
}

/**
 * A game's anticheat status, by Steam appid with a fallback by name.
 * null = the game is not in AWACY (no known problematic anticheat)
 * or the dataset is unavailable.
 */
export async function anticheatLookup(
  appid: string | null | undefined,
  name: string | null | undefined,
  swr?: cache.SwrPass,
): Promise<AnticheatInfo | null> {
  const index = await getIndex(swr);
  if (!index) return null;
  if (appid && index.bySteamId[appid]) return index.bySteamId[appid];
  if (!name) return null;
  // Exact normalized name first; then the edition-stripped base, so a
  // store variant missing its own appid entry ("Grand Theft Auto V
  // Enhanced") still surfaces the warning filed under the plain name.
  return index.byName[normalizeName(name)] ?? index.byBaseName[baseName(name)] ?? null;
}
