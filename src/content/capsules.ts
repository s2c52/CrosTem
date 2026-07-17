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

function nameHint(a: HTMLAnchorElement): string | null {
  const img = a.querySelector<HTMLImageElement>('img[alt]');
  if (img && img.alt.trim().length > 1) return img.alt.trim();
  const aria = a.getAttribute('aria-label');
  if (aria && aria.trim().length > 1) return aria.trim();
  if (a.title && a.title.trim().length > 1) return a.title.trim();
  const tabName = a.querySelector('.tab_item_name');
  return tabName?.textContent?.trim() || null;
}

function processAnchor(a: HTMLAnchorElement): void {
  if (a.dataset.crostemCapsule) return;
  if (a.classList.contains('search_result_row')) return; // already has an inline badge
  if (a.closest('.crostem-box, .crostem-badge, .crostem-overlay')) return;

  const appid = (a.getAttribute('href') ?? '').match(APP_LINK)?.[1];
  if (!appid) return;
  if (!a.querySelector('img, picture')) return; // only capsules with an image

  a.dataset.crostemCapsule = '1';
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
