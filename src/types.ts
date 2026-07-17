// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// CrosTem domain types.

/** Row of the CodeWeavers search results table. */
export interface CwSearchResult {
  name: string;
  slug: string;
  company: string;
  lastUpdated: string;
  /** Mac stars (0-5) or null if the row has no rating. */
  stars: number | null;
}

/** Rating box (Mac or Linux) from the CodeWeavers app page. */
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

/** Parsed CodeWeavers application page. */
export interface CwAppPage {
  slug: string | null;
  mac: CwRatingBox | null;
  linux: CwRatingBox | null;
  /** Breakdown by CrossOver version, most recent first. */
  versions: CwVersionRating[];
  aggregate: { value: number; count: number } | null;
}

export interface RankedResult extends CwSearchResult {
  score: number;
}

export interface RankOutcome {
  /** Single match clear enough to use without asking. */
  confident: RankedResult | null;
  /** Top 5 plausible candidates, ordered by score. */
  candidates: RankedResult[];
}

/** Name and native Mac flag from Steam's appdetails API. */
export interface SteamDetails {
  name: string | null;
  mac: boolean;
  /** Plain text of mac_requirements (min + rec, no HTML). Only if mac. */
  macRequirements?: string | null;
  releaseYear?: number | null;
}

export type MacArch = 'm-series' | 'intel';

/** Architecture of the native Mac binary and where the data came from. */
export interface ArchInfo {
  arch: MacArch;
  /** true = inferred (marked with "~", like approximate matching). */
  approximate: boolean;
  source: 'agw' | 'steam-reqs' | 'date';
  /** AGW page name, only when source === 'agw' (enables linking to it). */
  agwPage?: string;
}

/** Result of the automatic resolution of a badge/overlay. */
export type ResolveResult =
  | { kind: 'native'; arch: ArchInfo | null }
  | {
      kind: 'stars';
      stars: number | null;
      slug: string;
      cwName: string;
      approximate: boolean;
      level: VerdictLevel;
    }
  | { kind: 'ambiguous'; count: number; query: string; level: VerdictLevel }
  | { kind: 'dot'; level: VerdictLevel }
  | { kind: 'none' };

export interface AutoAttachOpts {
  appid?: string | null;
  name?: string | null;
  /** true = native Mac; false = definitely not; undefined = unknown. */
  native?: boolean;
  mode: 'overlay' | 'inline';
}

// --- Additional sources (F2) ---

/** Compatibility statuses published by AppleGamingWiki (Compatibility_macOS table). */
export type AgwStatus =
  'perfect' | 'playable' | 'runs' | 'menu' | 'unplayable' | "doesn't work" | 'na' | 'unknown';

export interface AgwCompat {
  page: string;
  crossover: AgwStatus;
  parallels: AgwStatus;
  native: AgwStatus;
  rosetta2: AgwStatus;
}

/** AreWeAntiCheatYet statuses (Linux/Proton data, indicative for CrossOver). */
export type AnticheatStatus = 'Supported' | 'Running' | 'Planned' | 'Broken' | 'Denied';

export interface AnticheatInfo {
  name: string;
  status: AnticheatStatus;
  anticheats: string[];
}

export type VerdictLevel = 'green' | 'yellow' | 'red' | 'unknown';

/** CodeWeavers signal for the verdict: the full app page or just the
 * stars from the search row (overlays case). */
export interface CwSignal {
  stars: number | null;
  status?: string;
}

// Content script ⇄ service worker messaging: a discriminated union so
// both ends stay type-checked when new message kinds appear. The service
// worker validates payloads at runtime (guards.isExtFetchRequest) —
// message shape is a trust boundary, not a type annotation.
export interface ExtFetchRequest {
  type: 'extFetch';
  url: string;
}

/** Every message a content script may send to the service worker. */
export type ExtMessage = ExtFetchRequest;

/** Why a fetch failed: lets callers distinguish retryable transport
 * problems from HTTP errors, policy rejections and an open breaker. */
export type FetchErrorCode =
  | 'timeout'
  | 'http'
  | 'network'
  | 'breaker-open'
  | 'not-allowed'
  | 'too-large';

export type ExtFetchResponse =
  | { ok: true; body: string; finalUrl: string }
  | { ok: false; error: string; code?: FetchErrorCode; status?: number };
