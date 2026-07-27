// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Allowlist of external resources the service worker may fetch on behalf
// of content scripts. This is the extension's security boundary: keep it
// pure so it stays unit-testable.

const ALLOWED: Array<{ host: string; pathPrefix: string }> = [
  { host: 'www.codeweavers.com', pathPrefix: '/compatibility' },
  { host: 'www.applegamingwiki.com', pathPrefix: '/w/api.php' },
  { host: 'raw.githubusercontent.com', pathPrefix: '/AreWeAntiCheatYet/' },
  // Steam appdetails is same-origin (and never proxied) from the store
  // surfaces; the library surface runs on steamcommunity.com, where it
  // is cross-origin and must go through the worker. The path prefix keeps
  // the rest of the store out of reach.
  { host: 'store.steampowered.com', pathPrefix: '/api/appdetails' },
];

/** True if the URL is https and points inside the allowlist. */
export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    ALLOWED.some((a) => parsed.hostname === a.host && parsed.pathname.startsWith(a.pathPrefix))
  );
}
