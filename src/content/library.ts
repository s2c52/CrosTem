// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam Community games list (steamcommunity.com/id/<user>/games, plus the
// /profiles/<id64> and /my forms): one CrossOver badge per row, next to the
// title. Like the wishlist this is a React SPA with per-build hashed class
// names, so rows are located by their /app/<id> links rather than by class.
// Two things differ from the wishlist and shape the code below:
//   - a row exposes the same appid more than once (title link, capsule art,
//     overflow menu), so a badge is only added when the document does not
//     already hold one for that appid;
//   - the list is far longer (hundreds of owned games) and virtualizes, so
//     the stamp carries the appid and is revalidated on every pass instead
//     of being a bare "seen" marker.
// This surface is also the only one that runs off store.steampowered.com,
// which is why lib/client routes appdetails through the service worker here.
import { attach, detach } from '../lib/auto';
import { SCAN_DEBOUNCE_MS } from '../lib/constants';
import { initContentI18n } from '../lib/i18n';
import { createIncrementalScanner } from '../lib/scan';
import { watchSurface } from '../lib/surface';
import '../styles.css';

const APP_LINK = /\/app\/(\d+)/;
const SEL = 'a[href*="/app/"]';

/** Appid the link points at (store page or community hub, same shape). */
function appidOf(a: HTMLAnchorElement): string | undefined {
  return (a.getAttribute('href') ?? '').match(APP_LINK)?.[1];
}

/** Badge already placed for this app, if any. Read from the DOM rather
 * than a Set so virtualization stays self-correcting: when a row unmounts
 * its badge leaves with it and the app becomes eligible again. */
function badgeFor(appid: string): HTMLElement | null {
  // appid is \d+ (regex-captured), so it is safe to interpolate here.
  return document.querySelector<HTMLElement>(`.crostem-badge[data-crostem-appid="${appid}"]`);
}

function looksLikeTitleLink(a: HTMLAnchorElement): boolean {
  if (a.closest('.crostem-badge')) return false;
  const text = a.textContent?.trim() ?? '';
  // Discards capsule/icon links (no text) and whole-row wrappers.
  return text.length >= 2 && text.length <= 150;
}

function removeBadge(badge: HTMLElement): void {
  detach(badge);
  badge.remove();
}

/** Drops the badge this link owns, if it is still next to it. */
function dropOwnBadge(a: HTMLAnchorElement): void {
  const next = a.nextElementSibling;
  if (next instanceof HTMLElement && next.classList.contains('crostem-badge')) removeBadge(next);
  delete a.dataset.crostem;
}

function processLink(a: HTMLAnchorElement): void {
  const appid = appidOf(a);
  const stamped = a.dataset.crostem;
  if (stamped !== undefined) {
    // Same app: already badged, nothing to do. Different app means the
    // virtualizer recycled this node instead of remounting it, so the old
    // badge belongs to a game that is no longer on this row.
    if (stamped === appid) return;
    dropOwnBadge(a);
  }
  if (!appid || !looksLikeTitleLink(a)) return;
  const name = a.textContent?.trim();
  if (!name) return;
  // Title link, capsule link and row menu all point at the same app;
  // only the first one carrying a usable title gets the badge.
  if (badgeFor(appid)) return;

  a.dataset.crostem = appid;
  const badge = document.createElement('span');
  badge.className = 'crostem-badge';
  badge.dataset.crostemAppid = appid;
  a.insertAdjacentElement('afterend', badge);

  attach(badge, { appid, name, mode: 'inline' });
}

/** roots = null means a full-document pass (initial scan / overflow). */
function scan(roots: readonly Element[] | null): void {
  if (roots === null) {
    document.querySelectorAll<HTMLAnchorElement>(SEL).forEach(processLink);
    return;
  }
  for (const root of roots) {
    if (root instanceof HTMLAnchorElement) processLink(root);
    root.querySelectorAll<HTMLAnchorElement>(SEL).forEach(processLink);
  }
}

const scanner = createIncrementalScanner(scan, SCAN_DEBOUNCE_MS);

const surface = {
  start(): void {
    scanner.start(document.body);
  },
  stop(): void {
    scanner.stop();
    document.querySelectorAll<HTMLElement>('.crostem-badge').forEach(removeBadge);
    document.querySelectorAll<HTMLElement>('a[data-crostem]').forEach((a) => {
      delete a.dataset.crostem;
    });
  },
};

void (async () => {
  await initContentI18n();
  await watchSurface('library', surface);
})();
