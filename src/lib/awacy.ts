// Cliente de AreWeAntiCheatYet: games.json (publicado en GitHub) con el
// estado del anticheat por juego, incluyendo el appid de Steam. Los datos son
// de Linux/Proton — para CrossOver son orientativos, y así se presenta.
// El dataset (~460KB) se descarga entero, se reduce a un índice compacto
// (appid y nombre normalizado) y se cachea 7 días.
import * as cache from './cache';
import { fetchExt } from './client';
import { normalizeName } from './matcher';
import type { AnticheatInfo, AnticheatStatus } from '../types';

const AWACY_URL = 'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json';
export const AWACY_SITE = 'https://areweanticheatyet.com/';

interface AwacyGame {
  name?: string;
  status?: string;
  anticheats?: string[];
  storeIds?: { steam?: string };
}

interface AwacyIndex {
  bySteamId: Record<string, AnticheatInfo>;
  byName: Record<string, AnticheatInfo>;
}

export function buildIndex(games: AwacyGame[]): AwacyIndex {
  const index: AwacyIndex = { bySteamId: {}, byName: {} };
  for (const g of games) {
    if (!g.name || !g.status) continue;
    const info: AnticheatInfo = {
      name: g.name,
      status: g.status as AnticheatStatus,
      anticheats: g.anticheats ?? [],
    };
    const steamId = g.storeIds?.steam;
    if (steamId) index.bySteamId[steamId] = info;
    index.byName[normalizeName(g.name)] = info;
  }
  return index;
}

async function getIndex(): Promise<AwacyIndex | null> {
  const cached = await cache.get<AwacyIndex>('awacy:index');
  if (cached !== undefined) return cached;
  try {
    const body = await fetchExt(AWACY_URL);
    const index = buildIndex(JSON.parse(body));
    await cache.set('awacy:index', index, await cache.ttlResult());
    return index;
  } catch {
    // AWACY caído: sin datos de anticheat, el veredicto sigue funcionando.
    await cache.set('awacy:index', null, cache.TTL_NEGATIVE);
    return null;
  }
}

/**
 * Estado del anticheat de un juego, por appid de Steam con fallback por
 * nombre. null = el juego no está en AWACY (sin anticheat problemático
 * conocido) o el dataset no está disponible.
 */
export async function anticheatLookup(appid: string | null | undefined, name: string | null | undefined): Promise<AnticheatInfo | null> {
  const index = await getIndex();
  if (!index) return null;
  if (appid && index.bySteamId[appid]) return index.bySteamId[appid];
  if (name) return index.byName[normalizeName(name)] ?? null;
  return null;
}
