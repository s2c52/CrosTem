// Tipos de dominio de CrosTem.

/** Fila de la tabla de resultados de búsqueda de CodeWeavers. */
export interface CwSearchResult {
  name: string;
  slug: string;
  company: string;
  lastUpdated: string;
  /** Estrellas Mac (0-5) o null si la fila no trae rating. */
  stars: number | null;
}

/** Bloque de rating (Mac o Linux) de la ficha de CodeWeavers. */
export interface CwRatingBox {
  stars: number | null;
  status: string;
  lastTested: string | null;
  reportCount: number | null;
}

export interface CwVersionRating {
  version: string;
  platform: 'macOS' | 'Linux';
  stars: number | null;
}

/** Ficha de aplicación de CodeWeavers parseada. */
export interface CwAppPage {
  slug: string | null;
  mac: CwRatingBox | null;
  linux: CwRatingBox | null;
  /** Desglose por versión de CrossOver, la más reciente primero. */
  versions: CwVersionRating[];
  aggregate: { value: number; count: number } | null;
}

export interface RankedResult extends CwSearchResult {
  score: number;
}

export interface RankOutcome {
  /** Coincidencia única suficientemente clara para usarla sin preguntar. */
  confident: RankedResult | null;
  /** Top 5 de candidatos plausibles, ordenados por score. */
  candidates: RankedResult[];
}

/** Nombre y flag de Mac nativo desde la API appdetails de Steam. */
export interface SteamDetails {
  name: string | null;
  mac: boolean;
}

/** Resultado de la resolución automática de un badge/overlay. */
export type ResolveResult =
  | { kind: 'native' }
  | { kind: 'stars'; stars: number | null; slug: string; cwName: string; approximate: boolean }
  | { kind: 'ambiguous'; count: number; query: string }
  | { kind: 'none' };

export interface AutoAttachOpts {
  appid?: string | null;
  name?: string | null;
  /** true = nativo Mac; false = seguro que no; undefined = desconocido. */
  native?: boolean;
  mode: 'overlay' | 'inline';
}

// Mensajería content script ⇄ service worker.
export interface CwFetchRequest {
  type: 'cwFetch';
  url: string;
}

export type CwFetchResponse =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: string };
