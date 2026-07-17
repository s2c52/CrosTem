// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam search results: automatic CrossOver badge per row
// (loads when the row becomes visible, via the lib/auto observer).
import { attach, detach } from '../lib/auto';
import { SCAN_DEBOUNCE_MS } from '../lib/constants';
import { coalesce } from '../lib/debounce';
import { initContentI18n } from '../lib/i18n';
import { watchSurface } from '../lib/surface';
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

let observer: MutationObserver | null = null;

const surface = {
  start(): void {
    scan();
    // Steam loads more rows via AJAX (infinite scroll / pagination);
    // rescans are coalesced — the row dataset guard keeps them idempotent.
    const resultsContainer =
      document.getElementById('search_resultsRows') ??
      document.getElementById('search_results') ??
      document.body;
    observer = new MutationObserver(coalesce(() => scan(resultsContainer), SCAN_DEBOUNCE_MS));
    observer.observe(resultsContainer, { childList: true, subtree: true });
  },
  stop(): void {
    observer?.disconnect();
    observer = null;
    document.querySelectorAll<HTMLElement>('.crostem-badge').forEach((badge) => {
      detach(badge);
      badge.remove();
    });
    document.querySelectorAll<HTMLElement>('a.search_result_row[data-crostem]').forEach((row) => {
      delete row.dataset.crostem;
    });
  },
};

void (async () => {
  await initContentI18n();
  await watchSurface('search', surface);
})();
