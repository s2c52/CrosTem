// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// AreWeAntiCheatYet client: games.json (published on GitHub) with the
// anticheat status per game, including the Steam appid. The data is for
// Linux/Proton — for CrossOver it is indicative, and presented as such.
// The dataset (~460KB) is downloaded whole, reduced to a compact index
// (appid and normalized name) and cached for 7 days. "Compact" is load
// bearing: the index is read back out of storage by every context that needs
// it, so it stores each entry once and keys into it by position.
import * as cache from './cache';
import { fetchExt } from './client';
import { isRecord } from './guards';
import { logDebug } from './log';
import { baseName, normalizeName } from './matcher';
import type { AnticheatInfo, AnticheatNote, AnticheatStatus } from '../types';

const AWACY_URL =
  'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json';
export const AWACY_SITE = 'https://areweanticheatyet.com/';

/**
 * The reduced dataset, held as one list plus three key maps into it.
 *
 * The maps store positions rather than entries. In memory that makes no
 * difference — three references to one object either way — but this index is
 * cached in chrome.storage, and JSON has no notion of a shared reference: an
 * entry reachable by appid, by name and by base name was written out three
 * times. The real dataset serialized to ~315KB that way, most of it copies,
 * and every context that reads the cache pays for them.
 */
interface AwacyIndex {
  /** Schema marker. Absent on indexes cached before the compact format. */
  v: 2;
  /** Every entry, exactly once. */
  games: AnticheatInfo[];
  bySteamId: Record<string, number>;
  byName: Record<string, number>;
  /** Same entries keyed by edition-stripped name ("grand theft auto v"),
   * so store variants ("… Enhanced") inherit the dataset's entry. */
  byBaseName: Record<string, number>;
}

/** Current schema. Bump when the cached shape changes incompatibly. */
const INDEX_VERSION = 2;

/** Resolve a position from one of the key maps. */
export function infoAt(index: AwacyIndex, position: number | undefined): AnticheatInfo | null {
  return position === undefined ? null : (index.games[position] ?? null);
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
  const index: AwacyIndex = {
    v: INDEX_VERSION,
    games: [],
    bySteamId: {},
    byName: {},
    byBaseName: {},
  };
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
    const at = index.games.push(info) - 1;
    const steamId = isRecord(g.storeIds) ? g.storeIds.steam : undefined;
    if (typeof steamId === 'string' && steamId) index.bySteamId[steamId] = at;
    index.byName[normalizeName(g.name)] = at;
    // When several names share a base ("X" and "X Enhanced"), the
    // suffix-less entry claims the slot regardless of dataset order.
    const base = baseName(g.name);
    if (!(base in index.byBaseName) || base === normalizeName(g.name)) {
      index.byBaseName[base] = at;
    }
  }
  return index;
}

// One in-flight download+parse+build serves every concurrent cold
// caller. A cold page fires dozens of badge resolutions at once, and
// each miss used to fetch the ~460KB dataset, parse it, build the index
// and write it to storage for itself. The cache probe stays per caller
// so each resolution's SwrPass is marked correctly.
let indexFetch: Promise<AwacyIndex | null> | null = null;

async function getIndex(swr?: cache.SwrPass): Promise<AwacyIndex | null> {
  const cached = await cache.getSwr<AwacyIndex>('awacy:index', swr);
  if (cached !== undefined) {
    // A cached negative ("AWACY was down") still counts as an answer.
    if (cached === null) return null;
    // Anything from before the compact format is refetched rather than
    // migrated: it is one download, it expires on its own anyway, and
    // reshaping an old index is code that would exist only to be wrong once.
    if (cached.v === INDEX_VERSION) return cached;
  }
  indexFetch ??= (async () => {
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
    } finally {
      indexFetch = null;
    }
  })();
  return indexFetch;
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
  if (appid) {
    // Position 0 is a real entry, so this must test for presence, not truth.
    const byId = infoAt(index, index.bySteamId[appid]);
    if (byId) return byId;
  }
  if (!name) return null;
  // Exact normalized name first; then the edition-stripped base, so a
  // store variant missing its own appid entry ("Grand Theft Auto V
  // Enhanced") still surfaces the warning filed under the plain name.
  return (
    infoAt(index, index.byName[normalizeName(name)]) ??
    infoAt(index, index.byBaseName[baseName(name)])
  );
}
