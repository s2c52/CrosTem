// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Allowlist of external resources the service worker may fetch on behalf
// of content scripts. This is the extension's security boundary: keep it
// pure so it stays unit-testable.

const ALLOWED: Array<{ host: string; pathPrefix: string }> = [
  { host: 'www.codeweavers.com', pathPrefix: '/compatibility' },
  { host: 'www.applegamingwiki.com', pathPrefix: '/w/api.php' },
  { host: 'raw.githubusercontent.com', pathPrefix: '/AreWeAntiCheatYet/' },
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
