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
import { normalizeName } from './matcher';
import type { AnticheatInfo, AnticheatStatus } from '../types';

const AWACY_URL =
  'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json';
export const AWACY_SITE = 'https://areweanticheatyet.com/';

interface AwacyIndex {
  bySteamId: Record<string, AnticheatInfo>;
  byName: Record<string, AnticheatInfo>;
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

/** Builds the index from the raw games.json entries. The dataset is
 * untrusted input: entries are validated field by field and unknown
 * statuses are dropped rather than flowing into the verdict. */
export function buildIndex(games: unknown[]): AwacyIndex {
  const index: AwacyIndex = { bySteamId: {}, byName: {} };
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
    const steamId = isRecord(g.storeIds) ? g.storeIds.steam : undefined;
    if (typeof steamId === 'string' && steamId) index.bySteamId[steamId] = info;
    index.byName[normalizeName(g.name)] = info;
  }
  return index;
}

async function getIndex(): Promise<AwacyIndex | null> {
  const cached = await cache.get<AwacyIndex>('awacy:index');
  if (cached !== undefined) return cached;
  try {
    const body = await fetchExt(AWACY_URL);
    const parsed: unknown = JSON.parse(body);
    const index = buildIndex(Array.isArray(parsed) ? parsed : []);
    await cache.set('awacy:index', index, await cache.ttlResult());
    return index;
  } catch {
    // AWACY down: no anticheat data, the verdict keeps working.
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
): Promise<AnticheatInfo | null> {
  const index = await getIndex();
  if (!index) return null;
  if (appid && index.bySteamId[appid]) return index.bySteamId[appid];
  if (name) return index.byName[normalizeName(name)] ?? null;
  return null;
}
