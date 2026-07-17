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

// React store hover cards: hovering a capsule expands it into a card with
// tags, reviews and price. Some variants have a semantic root class
// (category/sale pages), others (app-page carousels) are fully hashed and
// are recognized by the semantic markers INSIDE their anchors instead.
// Steam's semantic (non-hashed) class names, kept together for easy
// re-capture if the store markup changes.
const HOVER_CARD = '.LibraryAssetExpandedDisplay';
const HOVER_CARD_PRICE = '.StoreSalePriceWidgetContainer';
const HOVER_HERO_MARK = '[class*="WishlistButton"]';
const SUPPRESSED_CLASS = 'crostem-overlay-suppressed';

function nameHint(a: HTMLAnchorElement): string | null {
  const img = a.querySelector<HTMLImageElement>('img[alt]');
  if (img && img.alt.trim().length > 1) return img.alt.trim();
  const aria = a.getAttribute('aria-label');
  if (aria && aria.trim().length > 1) return aria.trim();
  if (a.title && a.title.trim().length > 1) return a.title.trim();
  const tabName = a.querySelector('.tab_item_name');
  return tabName?.textContent?.trim() || null;
}

function appidOf(a: HTMLAnchorElement): string | undefined {
  return (a.getAttribute('href') ?? '').match(APP_LINK)?.[1];
}

/** Hover-card hero anchor: screenshots area with the wishlist button. */
function isHoverHero(a: HTMLAnchorElement): boolean {
  return !!a.querySelector(HOVER_HERO_MARK);
}

/**
 * Hover-card mini-capsule anchor (hashed variant, mounts on hover): it
 * shares its grandparent (the card content) with the hero anchor. Regular
 * React tiles also carry a price widget inside the anchor, but never have
 * a wishlist-button hero as a direct sibling anchor at that level.
 */
function isHoverCardMini(a: HTMLAnchorElement): boolean {
  const cardContent = a.parentElement?.parentElement;
  return !!cardContent?.querySelector(`:scope > a ${HOVER_HERO_MARK}`);
}

/** True when the element lays its children out vertically. */
function stacksVertically(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === 'block') return true;
  return style.display.includes('flex') && style.flexDirection.startsWith('column');
}

/**
 * Render the single inline badge of a hover card right below its price:
 * walk up from the price widget to the nearest vertically-stacking
 * ancestor (layouts are hashed and responsive, so this adapts to every
 * variant) and insert the badge after the row that contains the price.
 */
function insertBadgeBelowPrice(
  boundary: HTMLElement,
  price: HTMLElement,
  appid: string,
  name: string | null,
): void {
  let rowWithPrice: HTMLElement = price;
  let parent = price.parentElement;
  while (parent && parent !== boundary && !stacksVertically(parent)) {
    rowWithPrice = parent;
    parent = parent.parentElement;
  }

  const badge = document.createElement('span');
  badge.className = 'crostem-badge crostem-hovercard-badge';
  rowWithPrice.insertAdjacentElement('afterend', badge);
  attach(badge, { appid, name, mode: 'inline' });
}

/** Semantic-class hover card (category/sale pages): one badge per card. */
function processHoverCard(card: HTMLElement, appid: string, name: string | null): void {
  if (card.dataset.crostemHoverCard) return;
  card.dataset.crostemHoverCard = '1';
  const price = card.querySelector<HTMLElement>(HOVER_CARD_PRICE);
  if (!price) return; // unexpected layout: better nothing than overlap
  insertBadgeBelowPrice(card, price, appid, name);
}

function processAnchor(a: HTMLAnchorElement): void {
  if (a.dataset.crostemCapsule) return;
  if (a.classList.contains('search_result_row')) return; // already has an inline badge
  if (a.closest('.crostem-box, .crostem-badge, .crostem-overlay')) return;

  const appid = appidOf(a);
  if (!appid) return;
  if (!a.querySelector('img, picture')) return; // only capsules with an image

  a.dataset.crostemCapsule = '1';

  const card = a.closest<HTMLElement>(HOVER_CARD);
  if (card) {
    processHoverCard(card, appid, nameHint(a));
    return;
  }

  // Hashed hover-card variant (app-page carousels, mounts on hover): the
  // hero anchor gets no overlay at all; the mini-capsule anchor receives
  // the card's single badge, below the price.
  if (isHoverHero(a)) {
    a.dataset.crostemHoverHero = '1';
    return;
  }
  const price = a.querySelector<HTMLElement>(HOVER_CARD_PRICE);
  if (price && isHoverCardMini(a)) {
    insertBadgeBelowPrice(a, price, appid, nameHint(a));
    return;
  }

  a.classList.add('crostem-capsule-host');

  const overlay = document.createElement('span');
  overlay.className = 'crostem-overlay';
  a.appendChild(overlay);

  attach(overlay, { appid, name: nameHint(a), mode: 'overlay' });
}

/**
 * React hydrates hover-card markup after our first scan, so a capsule
 * anchor may already carry a classic overlay by the time it turns into
 * (or into part of) a hover card. Migrate those: drop the overlay and
 * re-run the anchor through the hover-card paths.
 */
function fixupHoverCards(): void {
  document.querySelectorAll<HTMLElement>('.crostem-overlay').forEach((overlay) => {
    const host = overlay.closest<HTMLAnchorElement>('a');
    if (!host) return;
    const card = host.closest<HTMLElement>(HOVER_CARD);
    const hero = !card && isHoverHero(host);
    // Same discriminator as processAnchor: visible React tiles carry a
    // price widget too and legitimately keep their overlay.
    const price =
      !card && !hero && isHoverCardMini(host)
        ? host.querySelector<HTMLElement>(HOVER_CARD_PRICE)
        : null;
    if (!card && !hero && !price) return; // a regular capsule: keep its overlay

    overlay.remove();
    host.classList.remove('crostem-capsule-host');
    const appid = appidOf(host);
    if (!appid) return;
    if (card) {
      processHoverCard(card, appid, nameHint(host));
    } else if (hero) {
      host.dataset.crostemHoverHero = '1';
    } else if (price) {
      insertBadgeBelowPrice(host, price, appid, nameHint(host));
    }
  });
}

/**
 * An open hover card paints over neighboring capsules, but their absolute
 * overlays (z-indexed above Steam's card) would still shine through.
 * Geometric suppression: hide any overlay that intersects a visible
 * hover-card region; the next pass restores it once the card closes.
 */
function suppressCoveredOverlays(): void {
  const regions = [
    ...document.querySelectorAll<HTMLElement>(`${HOVER_CARD}, a[data-crostem-hover-hero='1']`),
  ]
    .map((el) => {
      // For hashed-variant heroes the card root is unknown: approximate
      // the card region with the hero's grandparent (the card body).
      const scope =
        el.dataset.crostemHoverHero === '1' ? (el.parentElement?.parentElement ?? el) : el;
      return scope.getBoundingClientRect();
    })
    .filter((r) => r.width > 120 && r.height > 100);

  document.querySelectorAll<HTMLElement>('.crostem-overlay').forEach((overlay) => {
    const r = overlay.getBoundingClientRect();
    const covered =
      r.width > 0 &&
      regions.some(
        (c) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top,
      );
    overlay.classList.toggle(SUPPRESSED_CLASS, covered);
  });
}

function scan(): void {
  fixupHoverCards();
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]').forEach(processAnchor);
  suppressCoveredOverlays();
}

const scheduleScan = coalesce(scan, SCAN_DEBOUNCE_MS);
const scheduleSuppress = coalesce(suppressCoveredOverlays, 150);

// Wishlist rows carry their own inline badge (content/wishlist.ts);
// overlaying their capsules too would duplicate the information.
if (!location.pathname.startsWith('/wishlist')) {
  void (async () => {
    if (!(await getSettings()).surfaces.capsules) return;
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    // Hover cards can open without childList mutations (pre-rendered,
    // CSS-toggled): re-check coverage as the pointer moves.
    document.addEventListener('mouseover', scheduleSuppress, { passive: true });
  })();
}
