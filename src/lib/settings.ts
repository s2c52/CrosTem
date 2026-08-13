// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// User settings. Stored in chrome.storage.sync (travels with the browser
// account); memoized per context and refreshed via storage.onChanged.

import { normalizeToSupported } from './steam-lang';

export interface Settings {
  surfaces: {
    app: boolean; // widget on the game page
    capsules: boolean; // overlays on capsules
    search: boolean; // badges in search results
    wishlist: boolean; // badges on the wishlist
    library: boolean; // badges on the community games list
  };
  sources: {
    cw: boolean; // CodeWeavers
    agw: boolean; // AppleGamingWiki
    anticheat: boolean; // AreWeAntiCheatYet
  };
  /** User's CrossOver branch (highlighted in the widget), e.g. "26". */
  crossoverVersion: string;
  /** Result cache TTL, in days (1-30). */
  cacheTtlDays: number;
  /** UI language: 'auto' follows the Steam page, else a supported locale. */
  language: string;
}

export const DEFAULTS: Settings = {
  surfaces: { app: true, capsules: true, search: true, wishlist: true, library: true },
  sources: { cw: true, agw: true, anticheat: true },
  crossoverVersion: '26',
  cacheTtlDays: 7,
  language: 'auto',
};

/** chrome.storage.sync key holding the Settings object. */
export const SETTINGS_KEY = 'settings';
const KEY = SETTINGS_KEY;

/** Valid range for the cache TTL, in days. */
export const CACHE_TTL_MIN_DAYS = 1;
export const CACHE_TTL_MAX_DAYS = 30;

/** Merges stored values with the defaults (new fields stay covered). */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored ?? {}) as Partial<Settings>;
  return {
    surfaces: { ...DEFAULTS.surfaces, ...(s.surfaces ?? {}) },
    sources: { ...DEFAULTS.sources, ...(s.sources ?? {}) },
    crossoverVersion:
      typeof s.crossoverVersion === 'string' && s.crossoverVersion.trim()
        ? s.crossoverVersion.trim()
        : DEFAULTS.crossoverVersion,
    cacheTtlDays:
      typeof s.cacheTtlDays === 'number' && Number.isFinite(s.cacheTtlDays) && s.cacheTtlDays > 0
        ? Math.min(CACHE_TTL_MAX_DAYS, Math.max(CACHE_TTL_MIN_DAYS, Math.round(s.cacheTtlDays)))
        : DEFAULTS.cacheTtlDays,
    language:
      s.language === 'auto'
        ? 'auto'
        : ((typeof s.language === 'string' ? normalizeToSupported(s.language) : null) ??
          DEFAULTS.language),
  };
}

let cached: Settings | null = null;

// Settings changes propagate without reloading Steam tabs: the memo is
// refreshed on every chrome.storage.sync change. Already-rendered badges
// keep their DOM; new resolutions pick up the new values.
// (typeof guard: this module is also imported by unit tests without chrome.)
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && KEY in changes) {
      cached = mergeSettings(changes[KEY]?.newValue);
    }
  });
}

let inflight: Promise<Settings> | null = null;

export async function getSettings(): Promise<Settings> {
  if (cached) return cached;
  // Single-flight: a cold page resolves many badges at once and every
  // resolution asks for settings; all concurrent callers share one
  // storage.sync.get instead of issuing one each.
  inflight ??= chrome.storage.sync.get(KEY).then(
    (obj) => {
      cached = mergeSettings(obj[KEY]);
      inflight = null;
      return cached;
    },
    (e: unknown) => {
      inflight = null;
      throw e;
    },
  );
  return inflight;
}

export async function saveSettings(settings: Settings): Promise<void> {
  cached = settings;
  await chrome.storage.sync.set({ [KEY]: settings });
}
