// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam Community games list (steamcommunity.com/id/<user>/games, plus the
// /profiles/<id64> and /my forms): one CrossOver badge per row, next to the
// title. Like the wishlist this is a React SPA with per-build hashed class
// names, so rows are located by their /app/<id> links rather than by class.
//
// Verified against a real logged-in capture (2026-07-26):
//   - every row links the same app three times: the capsule anchor (wraps
//     <picture>, no text), the title anchor, and "Store Page" inside the
//     row's popover="manual" overflow menu, which is in the DOM from the
//     start. Only the title is a candidate; the per-app dedupe then keeps
//     a row to one badge whatever else Steam adds.
//   - the list grows on scroll and never drops rows (706 games ended up in
//     the DOM together), so lookups here are kept O(1) rather than
//     document-wide, and the shared IntersectionObserver is what bounds
//     the actual network work to what is near the viewport.
// The appid-carrying stamp is cheap insurance: today Steam appends rather
// than recycling nodes, but a recycled anchor would otherwise keep the
// previous game's verdict.
//
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

/** Badge already placed per app. Entries are validated against the live
 * DOM on read, so a row that goes away frees its app again. */
const placed = new Map<string, HTMLElement>();

/** Appid the link points at, or undefined for the sibling links a row
 * also carries (/forum/<id>, /appofficialsite/<id>, /news/?appids=<id>),
 * none of which contain "/app/". */
function appidOf(a: HTMLAnchorElement): string | undefined {
  return (a.getAttribute('href') ?? '').match(APP_LINK)?.[1];
}

function badgeFor(appid: string): HTMLElement | null {
  const el = placed.get(appid);
  if (el?.isConnected) return el;
  if (el) placed.delete(appid);
  return null;
}

function looksLikeTitleLink(a: HTMLAnchorElement): boolean {
  if (a.closest('.crostem-badge')) return false;
  // The row's overflow menu repeats the app as "Store Page". Excluding the
  // popover outright — rather than relying on the title coming first in
  // document order — keeps the wrong label from ever being looked up as a
  // game name if React hydrates the menu before the title.
  if (a.closest('[popover]')) return false;
  const text = a.textContent?.trim() ?? '';
  // Discards the capsule anchor (image only) and whole-row wrappers.
  return text.length >= 2 && text.length <= 150;
}

function removeBadge(badge: HTMLElement): void {
  detach(badge);
  const appid = badge.dataset.crostemAppid;
  if (appid && placed.get(appid) === badge) placed.delete(appid);
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
    // Same app: already badged, nothing to do. A different one means the
    // node was reused for another game, so its badge is now wrong.
    if (stamped === appid) return;
    dropOwnBadge(a);
  }
  if (!appid || !looksLikeTitleLink(a)) return;
  const name = a.textContent?.trim();
  if (!name) return;
  if (badgeFor(appid)) return;

  a.dataset.crostem = appid;
  const badge = document.createElement('span');
  badge.className = 'crostem-badge';
  badge.dataset.crostemAppid = appid;
  a.insertAdjacentElement('afterend', badge);
  placed.set(appid, badge);

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
    placed.clear();
    document.querySelectorAll<HTMLElement>('a[data-crostem]').forEach((a) => {
      delete a.dataset.crostem;
    });
  },
};

void (async () => {
  await initContentI18n();
  await watchSurface('library', surface);
})();
