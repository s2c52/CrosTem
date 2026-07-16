// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Options page: surfaces, sources, CrossOver version, cache and
// export/import of matching corrections. Saves on change (no button).
import { t } from '../lib/i18n';
import { getSettings, saveSettings, type Settings } from '../lib/settings';

function $(id: string): HTMLElement {
  const node = document.getElementById(id);
  // The options page owns its DOM: a missing id is a programming error.
  if (!node) throw new Error(`CrosTem options: missing element #${id}`);
  return node;
}

function input(id: string): HTMLInputElement {
  return $(id) as HTMLInputElement;
}

function applyI18n(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (key) node.textContent = t(key);
  });
  document.title = t('optionsTitle');
}

let statusTimer: ReturnType<typeof setTimeout> | undefined;
function flash(msg: string): void {
  $('status').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    $('status').textContent = '';
  }, 2500);
}

function readForm(): Settings {
  return {
    surfaces: {
      app: input('surface-app').checked,
      capsules: input('surface-capsules').checked,
      search: input('surface-search').checked,
      wishlist: input('surface-wishlist').checked,
    },
    sources: {
      cw: input('source-cw').checked,
      agw: input('source-agw').checked,
      anticheat: input('source-anticheat').checked,
    },
    crossoverVersion: input('cx-version').value.trim() || '26',
    cacheTtlDays: Math.min(30, Math.max(1, Number(input('cache-ttl').value) || 7)),
  };
}

function fillForm(s: Settings): void {
  input('surface-app').checked = s.surfaces.app;
  input('surface-capsules').checked = s.surfaces.capsules;
  input('surface-search').checked = s.surfaces.search;
  input('surface-wishlist').checked = s.surfaces.wishlist;
  input('source-cw').checked = s.sources.cw;
  input('source-agw').checked = s.sources.agw;
  input('source-anticheat').checked = s.sources.anticheat;
  input('cx-version').value = s.crossoverVersion;
  input('cache-ttl').value = String(s.cacheTtlDays);
}

async function storageKeys(prefix: string): Promise<string[]> {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith(prefix));
}

async function refreshCounts(): Promise<void> {
  $('cache-count').textContent = t('optCacheCount', String((await storageKeys('cache:')).length));
  $('choices-count').textContent = t(
    'optChoicesCount',
    String((await storageKeys('choice:')).length),
  );
}

async function main(): Promise<void> {
  applyI18n();
  fillForm(await getSettings());
  await refreshCounts();

  document.querySelectorAll('input[type="checkbox"], #cx-version, #cache-ttl').forEach((node) => {
    node.addEventListener('change', () => {
      void saveSettings(readForm()).then(() => flash(t('optSaved')));
    });
  });

  $('clear-cache').addEventListener('click', () => {
    void (async () => {
      await chrome.storage.local.remove(await storageKeys('cache:'));
      await refreshCounts();
      flash(t('optCacheCleared'));
    })();
  });

  $('export-choices').addEventListener('click', () => {
    void (async () => {
      const keys = await storageKeys('choice:');
      const data = await chrome.storage.local.get(keys);
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'crostem-corrections.json';
      a.click();
      URL.revokeObjectURL(a.href);
    })();
  });

  $('import-choices').addEventListener('click', () => input('import-file').click());
  input('import-file').addEventListener('change', () => {
    const file = input('import-file').files?.[0];
    if (!file) return;
    void file.text().then(async (text) => {
      try {
        const data = JSON.parse(text) as Record<string, unknown>;
        const entries = Object.fromEntries(
          Object.entries(data).filter(([k, v]) => k.startsWith('choice:') && typeof v === 'string'),
        );
        if (Object.keys(entries).length === 0) throw new Error('empty');
        await chrome.storage.local.set(entries);
        await refreshCounts();
        flash(t('optImported'));
      } catch {
        flash(t('optImportError'));
      }
    });
  });

  $('clear-choices').addEventListener('click', () => {
    void (async () => {
      await chrome.storage.local.remove(await storageKeys('choice:'));
      await refreshCounts();
      flash(t('optSaved'));
    })();
  });
}

void main();
