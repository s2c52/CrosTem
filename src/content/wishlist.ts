// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam wishlist: automatic CrossOver badge per row. The wishlist is
// a React SPA with obfuscated classes, so instead of relying on classes
// we look for links to /app/<id> that carry the title as text. The native
// Mac flag arrives via Steam's appdetails API (resolved in lib/auto).
import { attach } from '../lib/auto';
import { SCAN_DEBOUNCE_MS } from '../lib/constants';
import { coalesce } from '../lib/debounce';
import { initI18n, persistUiLang } from '../lib/i18n';
import { getSettings } from '../lib/settings';
import { detectPageLocale } from '../lib/steam-lang';
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

function scan(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]').forEach((a) => {
    if (!looksLikeTitleLink(a)) return;
    const appid = (a.getAttribute('href') ?? '').match(APP_LINK)?.[1];
    const name = a.textContent?.trim();
    if (!appid || !name) return;
    a.dataset.crostem = '1';

    const badge = document.createElement('span');
    badge.className = 'crostem-badge';
    a.insertAdjacentElement('afterend', badge);

    attach(badge, { appid, name, mode: 'inline' });
  });
}

const scheduleScan = coalesce(scan, SCAN_DEBOUNCE_MS);

void (async () => {
  await initI18n(detectPageLocale());
  void persistUiLang();
  if (!(await getSettings()).surfaces.wishlist) return;
  scan();
  new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
})();
