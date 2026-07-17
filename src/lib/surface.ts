// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Live mount/unmount of a store surface. Each content script hands in a
// start/stop pair; toggling the surface in the popup or options applies
// immediately via storage.onChanged — no tab reload needed.
import { getSettings, mergeSettings, SETTINGS_KEY, type Settings } from './settings';

export interface SurfaceController {
  /** Mounts the surface (initial scan, observers, listeners). */
  start(): void;
  /** Unmounts it: disconnect observers and remove injected nodes. */
  stop(): void;
}

export async function watchSurface(
  key: keyof Settings['surfaces'],
  surface: SurfaceController,
): Promise<void> {
  let mounted = false;
  const apply = (enabled: boolean): void => {
    if (enabled === mounted) return;
    mounted = enabled;
    if (enabled) surface.start();
    else surface.stop();
  };
  // Listener first so a change arriving during the initial read wins.
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !(SETTINGS_KEY in changes)) return;
      apply(mergeSettings(changes[SETTINGS_KEY]?.newValue).surfaces[key]);
    });
  }
  apply((await getSettings()).surfaces[key]);
}
