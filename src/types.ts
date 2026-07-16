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
  | { kind: 'stars'; stars: number | null; slug: string; cwName: string; approximate: boolean; level: VerdictLevel }
  | { kind: 'ambiguous'; count: number; query: string; level: VerdictLevel }
  | { kind: 'dot'; level: VerdictLevel; title: string }
  | { kind: 'none' };

export interface AutoAttachOpts {
  appid?: string | null;
  name?: string | null;
  /** true = nativo Mac; false = seguro que no; undefined = desconocido. */
  native?: boolean;
  mode: 'overlay' | 'inline';
}

// --- Fuentes adicionales (F2) ---

/** Estados de compatibilidad que publica AppleGamingWiki (tabla Compatibility_macOS). */
export type AgwStatus =
  | 'perfect' | 'playable' | 'runs' | 'menu'
  | 'unplayable' | "doesn't work" | 'na' | 'unknown';

export interface AgwCompat {
  page: string;
  crossover: AgwStatus;
  parallels: AgwStatus;
  native: AgwStatus;
  rosetta2: AgwStatus;
}

/** Estados de AreWeAntiCheatYet (datos de Linux/Proton, orientativos para CrossOver). */
export type AnticheatStatus = 'Supported' | 'Running' | 'Planned' | 'Broken' | 'Denied';

export interface AnticheatInfo {
  name: string;
  status: AnticheatStatus;
  anticheats: string[];
}

export type VerdictLevel = 'green' | 'yellow' | 'red' | 'unknown';

export interface Verdict {
  level: VerdictLevel;
  label: string;
  reasons: string[];
}

/** Señal de CodeWeavers para el veredicto: la ficha completa o solo las
 * estrellas de la fila de búsqueda (caso overlays). */
export interface CwSignal {
  stars: number | null;
  status?: string;
}

// Mensajería content script ⇄ service worker.
export interface ExtFetchRequest {
  type: 'extFetch';
  url: string;
}

export type ExtFetchResponse =
  | { ok: true; body: string; finalUrl: string }
  | { ok: false; error: string };
