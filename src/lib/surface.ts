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

/** Resolves to a disposer: unsubscribes from settings changes and
 * unmounts the surface. Extension content scripts live as long as their
 * page and may ignore it; embedders that tear surfaces down (the desktop
 * shim declares onChanged.removeListener too) use it to avoid leaking
 * one listener per mount. */
export async function watchSurface(
  key: keyof Settings['surfaces'],
  surface: SurfaceController,
): Promise<() => void> {
  let mounted = false;
  const apply = (enabled: boolean): void => {
    if (enabled === mounted) return;
    mounted = enabled;
    if (enabled) surface.start();
    else surface.stop();
  };
  const onChange = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    area: string,
  ): void => {
    if (area !== 'sync' || !(SETTINGS_KEY in changes)) return;
    apply(mergeSettings(changes[SETTINGS_KEY]?.newValue).surfaces[key]);
  };
  // Listener first so a change arriving during the initial read wins.
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(onChange);
  }
  apply((await getSettings()).surfaces[key]);
  return () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(onChange);
    }
    apply(false);
  };
}
