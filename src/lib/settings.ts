// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// User settings. Stored in chrome.storage.sync (travels with the browser
// account); content scripts read them once at startup —
// changes require reloading the Steam tabs.

export interface Settings {
  surfaces: {
    app: boolean;      // widget on the game page
    capsules: boolean; // overlays on capsules
    search: boolean;   // badges in search results
    wishlist: boolean; // badges on the wishlist
  };
  sources: {
    cw: boolean;        // CodeWeavers
    agw: boolean;       // AppleGamingWiki
    anticheat: boolean; // AreWeAntiCheatYet
  };
  /** User's CrossOver branch (highlighted in the widget), e.g. "26". */
  crossoverVersion: string;
  /** Result cache TTL, in days (1-30). */
  cacheTtlDays: number;
}

export const DEFAULTS: Settings = {
  surfaces: { app: true, capsules: true, search: true, wishlist: true },
  sources: { cw: true, agw: true, anticheat: true },
  crossoverVersion: '26',
  cacheTtlDays: 7,
};

const KEY = 'settings';

/** Merges stored values with the defaults (new fields stay covered). */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored ?? {}) as Partial<Settings>;
  return {
    surfaces: { ...DEFAULTS.surfaces, ...(s.surfaces ?? {}) },
    sources: { ...DEFAULTS.sources, ...(s.sources ?? {}) },
    crossoverVersion: typeof s.crossoverVersion === 'string' && s.crossoverVersion.trim()
      ? s.crossoverVersion.trim()
      : DEFAULTS.crossoverVersion,
    cacheTtlDays: typeof s.cacheTtlDays === 'number' && s.cacheTtlDays >= 1 && s.cacheTtlDays <= 30
      ? Math.round(s.cacheTtlDays)
      : DEFAULTS.cacheTtlDays,
  };
}

let cached: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cached) return cached;
  const obj = await chrome.storage.sync.get(KEY);
  cached = mergeSettings(obj[KEY]);
  return cached;
}

export async function saveSettings(settings: Settings): Promise<void> {
  cached = settings;
  await chrome.storage.sync.set({ [KEY]: settings });
}
