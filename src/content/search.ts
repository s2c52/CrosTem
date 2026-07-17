// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam search results: automatic CrossOver badge per row
// (loads when the row becomes visible, via the lib/auto observer).
import { attach } from '../lib/auto';
import { initI18n, persistUiLang } from '../lib/i18n';
import { getSettings } from '../lib/settings';
import { detectPageLocale } from '../lib/steam-lang';
import '../styles.css';

function processRow(row: HTMLElement): void {
  if (row.dataset.crostem) return;
  row.dataset.crostem = '1';

  const titleEl = row.querySelector('.search_name .title');
  const name = titleEl?.textContent?.trim();
  if (!titleEl || !name) return;

  const badge = document.createElement('span');
  badge.className = 'crostem-badge';
  titleEl.insertAdjacentElement('afterend', badge);

  // Search rows always show platform icons: the absence of the
  // Mac icon is a reliable "not native" signal.
  attach(badge, {
    appid: row.getAttribute('data-ds-appid'),
    name,
    native: !!row.querySelector('.platform_img.mac'),
    mode: 'inline',
  });
}

function scan(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('a.search_result_row').forEach(processRow);
}

void (async () => {
  await initI18n(detectPageLocale());
  void persistUiLang();
  if (!(await getSettings()).surfaces.search) return;
  scan();

  // Steam loads more rows via AJAX (infinite scroll / pagination).
  const resultsContainer =
    document.getElementById('search_resultsRows') ??
    document.getElementById('search_results') ??
    document.body;
  new MutationObserver(() => scan(resultsContainer)).observe(resultsContainer, {
    childList: true,
    subtree: true,
  });
})();
