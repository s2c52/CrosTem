// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Toolbar popup: manual search against CodeWeavers (useful outside
// Steam) + access to settings. Uses the same client/cache as the rest.
import { appUrl, search } from '../lib/client';
import { MAX_POPUP_RESULTS, SEARCH_DEBOUNCE_MS } from '../lib/constants';
import { debounce } from '../lib/debounce';
import { t } from '../lib/i18n';
import { starsEl } from '../lib/widget';
import '../styles.css';

function mustGet(id: string): HTMLElement {
  const node = document.getElementById(id);
  // The popup owns its DOM: a missing id is a programming error.
  if (!node) throw new Error(`CrosTem popup: missing element #${id}`);
  return node;
}

const queryEl = mustGet('query') as HTMLInputElement;
const resultsEl = mustGet('results');
const optionsLink = mustGet('open-options') as HTMLAnchorElement;

queryEl.placeholder = t('popupSearchPlaceholder');
optionsLink.textContent = t('popupOptions');
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});

let lastQuery = '';

async function runSearch(q: string): Promise<void> {
  lastQuery = q;
  resultsEl.textContent = '';
  if (q.trim().length < 2) return;
  const loading = document.createElement('div');
  loading.className = 'muted';
  loading.textContent = '…';
  resultsEl.appendChild(loading);
  try {
    const results = await search(q);
    if (lastQuery !== q) return; // arrived late: there is a newer search
    resultsEl.textContent = '';
    if (results.length === 0) {
      const none = document.createElement('div');
      none.className = 'muted';
      none.textContent = t('popupNoResults');
      resultsEl.appendChild(none);
      return;
    }
    for (const r of results.slice(0, MAX_POPUP_RESULTS)) {
      const a = document.createElement('a');
      a.className = 'result';
      a.href = appUrl(r.slug);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = r.name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.appendChild(starsEl(r.stars));
      meta.appendChild(document.createTextNode(r.company ? ` · ${r.company}` : ''));
      a.append(name, meta);
      resultsEl.appendChild(a);
    }
  } catch {
    if (lastQuery !== q) return;
    resultsEl.textContent = '';
    const err = document.createElement('div');
    err.className = 'muted';
    err.textContent = t('popupError');
    resultsEl.appendChild(err);
  }
}

const debouncedSearch = debounce(() => void runSearch(queryEl.value), SEARCH_DEBOUNCE_MS);
queryEl.addEventListener('input', debouncedSearch);
