// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Star overlay on game capsules (images) across the whole
// Steam store: front page, deals, categories, "more like this", etc.
import { attach } from '../lib/auto';
import { SCAN_DEBOUNCE_MS } from '../lib/constants';
import { coalesce } from '../lib/debounce';
import { getSettings } from '../lib/settings';
import '../styles.css';

const APP_LINK = /\/app\/(\d+)/;

// React store hover card (category/sale pages and home v2): hovering a
// capsule expands it into a card with tags, reviews and price. Steam's
// semantic (non-hashed) class names, kept together for easy re-capture
// if the store markup changes.
const HOVER_CARD = '.LibraryAssetExpandedDisplay';
const HOVER_CARD_PRICE = '.StoreSalePriceWidgetContainer';

function nameHint(a: HTMLAnchorElement): string | null {
  const img = a.querySelector<HTMLImageElement>('img[alt]');
  if (img && img.alt.trim().length > 1) return img.alt.trim();
  const aria = a.getAttribute('aria-label');
  if (aria && aria.trim().length > 1) return aria.trim();
  if (a.title && a.title.trim().length > 1) return a.title.trim();
  const tabName = a.querySelector('.tab_item_name');
  return tabName?.textContent?.trim() || null;
}

/**
 * Inside an expanded hover card an absolute overlay would land on top of
 * the price and duplicate the collapsed capsule's pill. Instead, render a
 * single inline badge right below the price block.
 */
function processHoverCard(card: HTMLElement, appid: string, name: string | null): void {
  if (card.dataset.crostemHoverCard) return;
  card.dataset.crostemHoverCard = '1';

  // Insert after the whole price row (two wrappers above the price
  // widget) so the badge gets its own line right below the price.
  const price = card.querySelector(HOVER_CARD_PRICE);
  const anchorPoint = price?.parentElement?.parentElement ?? price?.parentElement ?? null;
  if (!anchorPoint) return; // unexpected layout: better nothing than overlap

  const badge = document.createElement('span');
  badge.className = 'crostem-badge crostem-hovercard-badge';
  anchorPoint.insertAdjacentElement('afterend', badge);
  attach(badge, { appid, name, mode: 'inline' });
}

function processAnchor(a: HTMLAnchorElement): void {
  if (a.dataset.crostemCapsule) return;
  if (a.classList.contains('search_result_row')) return; // already has an inline badge
  if (a.closest('.crostem-box, .crostem-badge, .crostem-overlay')) return;

  const appid = (a.getAttribute('href') ?? '').match(APP_LINK)?.[1];
  if (!appid) return;
  if (!a.querySelector('img, picture')) return; // only capsules with an image

  a.dataset.crostemCapsule = '1';

  const card = a.closest<HTMLElement>(HOVER_CARD);
  if (card) {
    processHoverCard(card, appid, nameHint(a));
    return;
  }

  a.classList.add('crostem-capsule-host');

  const overlay = document.createElement('span');
  overlay.className = 'crostem-overlay';
  a.appendChild(overlay);

  attach(overlay, { appid, name: nameHint(a), mode: 'overlay' });
}

function scan(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]').forEach(processAnchor);
}

const scheduleScan = coalesce(scan, SCAN_DEBOUNCE_MS);

// Wishlist rows carry their own inline badge (content/wishlist.ts);
// overlaying their capsules too would duplicate the information.
if (!location.pathname.startsWith('/wishlist')) {
  void (async () => {
    if (!(await getSettings()).surfaces.capsules) return;
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
  })();
}
