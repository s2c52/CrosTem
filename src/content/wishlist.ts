// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam wishlist: automatic CrossOver badge per row. The wishlist is
// a React SPA with obfuscated classes, so instead of relying on classes
// we look for links to /app/<id> that carry the title as text. The native
// Mac flag arrives via Steam's appdetails API (resolved in lib/auto).
import { attach, detach } from '../lib/auto';
import { SCAN_DEBOUNCE_MS } from '../lib/constants';
import { initContentI18n } from '../lib/i18n';
import { createIncrementalScanner } from '../lib/scan';
import { watchSurface } from '../lib/surface';
import '../styles.css';

const APP_LINK = /\/app\/(\d+)/;

function looksLikeTitleLink(a: HTMLAnchorElement): boolean {
  if (a.dataset.crostem) return false;
  if (a.closest('.crostem-box, .crostem-badge, .crostem-overlay')) return false;
  const href = a.getAttribute('href') ?? '';
  if (!APP_LINK.test(href)) return false;
  const text = a.textContent?.trim() ?? '';
  // Discards icon/image-only links and huge containers.
  return text.length >= 2 && text.length <= 150;
}

function processLink(a: HTMLAnchorElement): void {
  if (!looksLikeTitleLink(a)) return;
  const appid = (a.getAttribute('href') ?? '').match(APP_LINK)?.[1];
  const name = a.textContent?.trim();
  if (!appid || !name) return;
  a.dataset.crostem = '1';

  const badge = document.createElement('span');
  badge.className = 'crostem-badge';
  a.insertAdjacentElement('afterend', badge);

  attach(badge, { appid, name, mode: 'inline' });
}

/** roots = null means a full-document pass (initial scan / overflow). */
function scan(roots: readonly Element[] | null): void {
  const SEL = 'a[href*="/app/"]';
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
    document.querySelectorAll<HTMLElement>('.crostem-badge').forEach((badge) => {
      detach(badge);
      badge.remove();
    });
    document.querySelectorAll<HTMLElement>('a[data-crostem]').forEach((a) => {
      delete a.dataset.crostem;
    });
  },
};

void (async () => {
  await initContentI18n();
  await watchSurface('wishlist', surface);
})();
