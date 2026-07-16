// Cliente de AppleGamingWiki: API MediaWiki cargoquery sobre la tabla
// Compatibility_macOS (estados de CrossOver / Parallels / nativo / Rosetta 2
// por página de juego). El matching de página usa el mismo scoring que
// CodeWeavers; una corrección del usuario (choice) gana siempre.
import * as cache from './cache';
import { fetchExt } from './client';
import { baseName, rank } from './matcher';
import type { AgwCompat, AgwStatus, CwSearchResult } from '../types';

const AGW_API = 'https://www.applegamingwiki.com/w/api.php';

export function agwPageUrl(page: string): string {
  return 'https://www.applegamingwiki.com/wiki/' + encodeURIComponent(page.replace(/ /g, '_'));
}

interface CargoRow {
  title: {
    Page: string;
    crossover?: string;
    parallels?: string;
    native?: string;
    'rosetta 2'?: string;
  };
}

function toStatus(v: string | undefined): AgwStatus {
  const s = (v ?? '').trim().toLowerCase().replace(/[’']/g, "'");
  const known: AgwStatus[] = ['perfect', 'playable', 'runs', 'menu', 'unplayable', "doesn't work", 'na'];
  return (known as string[]).includes(s) ? (s as AgwStatus) : 'unknown';
}

function toCompat(row: CargoRow): AgwCompat {
  return {
    page: row.title.Page,
    crossover: toStatus(row.title.crossover),
    parallels: toStatus(row.title.parallels),
    native: toStatus(row.title.native),
    rosetta2: toStatus(row.title['rosetta 2']),
  };
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

/** Parseo puro de la respuesta cargoquery (testeable con fixtures). */
export function parseCargoResponse(body: string): AgwCompat[] {
  const json = JSON.parse(body);
  const rows: CargoRow[] = json?.cargoquery ?? [];
  return rows.map(toCompat);
}

async function cargoQuery(where: string, limit: number): Promise<AgwCompat[]> {
  return parseCargoResponse(await fetchExt(cargoUrl(where, limit)));
}

// El where de cargo es SQL: se eliminan comillas y se busca por tokens con
// LIKE para esquivar problemas de escapado y de puntuación en los títulos.
function likePattern(name: string): string {
  const tokens = baseName(name).split(' ').filter(Boolean);
  return '%' + tokens.join('%') + '%';
}

/**
 * Busca la compatibilidad AGW de un juego por nombre. Devuelve null si no hay
 * página que case con confianza.
 */
export async function agwLookup(name: string, appid?: string | null): Promise<AgwCompat | null> {
  const base = baseName(name);
  if (!base) return null;

  // Corrección del usuario (por appid) — se guarda la página elegida.
  if (appid) {
    const chosen = await cache.getSourceChoice('agw', appid);
    if (chosen) {
      const rows = await cachedQuery(`_pageName='${chosen.replace(/'/g, "''")}'`, 1, 'agw:page:' + chosen);
      if (rows.length > 0) return rows[0];
    }
  }

  const cacheKey = 'agw:' + base;
  const cached = await cache.get<AgwCompat | null>(cacheKey);
  if (cached !== undefined) return cached;

  let result: AgwCompat | null = null;
  try {
    const rows = await cargoQuery(`_pageName LIKE '${likePattern(name).replace(/'/g, "''")}'`, 10);
    // Reutiliza el ranking de matcher tratando las páginas como candidatos.
    const asResults: CwSearchResult[] = rows.map((r) => ({
      name: r.page, slug: r.page, company: '', lastUpdated: '', stars: null,
    }));
    const ranked = rank(name, asResults);
    const pick = ranked.confident ?? (ranked.candidates.length === 1 ? ranked.candidates[0] : null);
    result = pick ? rows.find((r) => r.page === pick.slug) ?? null : null;
  } catch {
    result = null; // AGW caído no debe romper el widget
  }

  await cache.set(cacheKey, result, result ? await cache.ttlResult() : cache.TTL_NEGATIVE);
  return result;
}

async function cachedQuery(where: string, limit: number, key: string): Promise<AgwCompat[]> {
  const cached = await cache.get<AgwCompat[]>(key);
  if (cached !== undefined) return cached;
  const rows = await cargoQuery(where, limit);
  await cache.set(key, rows);
  return rows;
}

/** Clave de caché para invalidación selectiva (botón refresh). */
export function agwCacheKey(name: string): string {
  return 'agw:' + baseName(name);
}
