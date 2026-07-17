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

/** True when the element lays its children out vertically. */
function stacksVertically(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === 'block') return true;
  return style.display.includes('flex') && style.flexDirection.startsWith('column');
}

/**
 * Inside an expanded hover card an absolute overlay would land on top of
 * the price and duplicate the collapsed capsule's pill. Instead, render a
 * single inline badge right below the price block: walk up from the price
 * widget to the nearest vertically-stacking ancestor (the card's layouts
 * are all hashed classes, so this adapts to every responsive variant) and
 * insert the badge after the row that contains the price.
 */
function processHoverCard(card: HTMLElement, appid: string, name: string | null): void {
  if (card.dataset.crostemHoverCard) return;
  card.dataset.crostemHoverCard = '1';

  const price = card.querySelector<HTMLElement>(HOVER_CARD_PRICE);
  if (!price) return; // unexpected layout: better nothing than overlap

  let rowWithPrice: HTMLElement = price;
  let parent = price.parentElement;
  while (parent && parent !== card && !stacksVertically(parent)) {
    rowWithPrice = parent;
    parent = parent.parentElement;
  }

  const badge = document.createElement('span');
  badge.className = 'crostem-badge crostem-hovercard-badge';
  rowWithPrice.insertAdjacentElement('afterend', badge);
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

/**
 * React hydrates the hover-card class after our first scan, so a capsule
 * anchor may already carry a classic overlay by the time its ancestor
 * becomes a hover card. Migrate those: drop the overlay, badge the card.
 */
function fixupHoverCards(): void {
  document
    .querySelectorAll<HTMLElement>(`${HOVER_CARD} .crostem-overlay`)
    .forEach((overlay) => {
      const card = overlay.closest<HTMLElement>(HOVER_CARD);
      const host = overlay.closest<HTMLAnchorElement>('a');
      overlay.remove();
      if (!card || !host) return;
      host.classList.remove('crostem-capsule-host');
      const appid = (host.getAttribute('href') ?? '').match(APP_LINK)?.[1];
      if (appid) processHoverCard(card, appid, nameHint(host));
    });
}

function scan(): void {
  fixupHoverCards();
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
