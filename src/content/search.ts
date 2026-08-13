// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam search results: automatic CrossOver badge per row
// (loads when the row becomes visible, via the lib/auto observer).
import { attach, detach } from '../lib/auto';
import { SCAN_DEBOUNCE_MS } from '../lib/constants';
import { initContentI18n } from '../lib/i18n';
import { createIncrementalScanner } from '../lib/scan';
import { watchSurface } from '../lib/surface';
import '../styles.css';

const ROW_SEL = 'a.search_result_row';

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

/** AJAX pagination appends row batches inside this container. */
function resultsRoot(): HTMLElement {
  return (
    document.getElementById('search_resultsRows') ??
    document.getElementById('search_results') ??
    document.body
  );
}

/** roots = null means a full pass (initial scan / batch overflow). */
function scan(roots: readonly Element[] | null): void {
  if (roots === null) {
    resultsRoot().querySelectorAll<HTMLElement>(ROW_SEL).forEach(processRow);
    return;
  }
  // Incremental: only the added subtrees are queried, instead of the old
  // re-querySelectorAll over the ever-growing results container. The
  // shared scanner also filters our own badge churn (renderBadge appends
  // children inside .crostem-badge), which used to re-arm the observer on
  // every paint.
  for (const root of roots) {
    if (root instanceof HTMLElement && root.matches(ROW_SEL)) processRow(root);
    root.querySelectorAll<HTMLElement>(ROW_SEL).forEach(processRow);
  }
}

const scanner = createIncrementalScanner(scan, SCAN_DEBOUNCE_MS);

const surface = {
  start(): void {
    // Observing the results container (not body) keeps unrelated page
    // churn away from the scanner; start() runs the initial full pass.
    scanner.start(resultsRoot());
  },
  stop(): void {
    scanner.stop();
    document.querySelectorAll<HTMLElement>('.crostem-badge').forEach((badge) => {
      detach(badge);
      badge.remove();
    });
    document.querySelectorAll<HTMLElement>(`${ROW_SEL}[data-crostem]`).forEach((row) => {
      delete row.dataset.crostem;
    });
  },
};

void (async () => {
  await initContentI18n();
  await watchSurface('search', surface);
})();
