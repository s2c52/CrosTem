// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Options page: surfaces, sources, CrossOver version, cache and
// export/import of matching corrections. Saves on change (no button).
import { storageKeys } from '../lib/cache';
import { MAX_IMPORT_ENTRIES, MAX_IMPORT_VALUE_LEN } from '../lib/constants';
import { sanitizeChoiceImport } from '../lib/guards';
import { applyI18n, currentLocale, initExtPageI18n, t } from '../lib/i18n';
import { ctLogo } from '../lib/logo';
import { getSettings, mergeSettings, saveSettings, type Settings } from '../lib/settings';
import { LOCALE_NATIVE_NAMES } from '../lib/steam-lang';

function $(id: string): HTMLElement {
  const node = document.getElementById(id);
  // The options page owns its DOM: a missing id is a programming error.
  if (!node) throw new Error(`CrosTem options: missing element #${id}`);
  return node;
}

function input(id: string): HTMLInputElement {
  return $(id) as HTMLInputElement;
}

function select(id: string): HTMLSelectElement {
  return $(id) as HTMLSelectElement;
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
  // mergeSettings is the single source of truth for validation/clamping.
  return mergeSettings({
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
    crossoverVersion: input('cx-version').value,
    cacheTtlDays: Number(input('cache-ttl').value) || undefined,
    language: select('ui-language').value,
  });
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
  select('ui-language').value = s.language;
}

/** Fill #ui-language with the supported locales; "auto" is already in the HTML. */
function populateLanguageSelect(): void {
  const node = select('ui-language');
  Object.entries(LOCALE_NATIVE_NAMES)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .forEach(([code, name]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      node.append(option);
    });
}

async function refreshCounts(): Promise<void> {
  $('cache-count').textContent = t('optCacheCount', String((await storageKeys('cache:')).length));
  const choiceKeys = await storageKeys('choice:');
  const agwCount = choiceKeys.filter((k) => k.startsWith('choice:agw:')).length;
  const cwCount = choiceKeys.length - agwCount;
  $('choices-count').textContent =
    t('optChoicesCount', String(choiceKeys.length)) +
    (choiceKeys.length > 0
      ? ` (${t('optChoicesSplit', [String(cwCount), String(agwCount)])})`
      : '');
}

// "Apply now" bar: appears after any save and reloads open Steam tabs.
let applyTimer: ReturnType<typeof setTimeout> | undefined;

function showApplyBar(): void {
  const bar = $('apply-bar');
  clearTimeout(applyTimer);
  $('apply-msg').textContent = t('optSaved');
  $('apply-now').removeAttribute('hidden');
  bar.hidden = false;
}

async function applyToSteamTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://store.steampowered.com/*' });
  await Promise.all(
    tabs.flatMap((tab) => (tab.id != null ? [chrome.tabs.reload(tab.id)] : [])),
  );
  $('apply-msg').textContent = t('optApplied', String(tabs.length));
  $('apply-now').setAttribute('hidden', '');
  clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    $('apply-bar').hidden = true;
  }, 2500);
}

async function main(): Promise<void> {
  await initExtPageI18n();
  document.documentElement.lang = currentLocale();
  applyI18n('optionsTitle');
  document.querySelector('.logo')?.replaceWith(ctLogo(22));
  $('about-version').textContent = chrome.runtime.getManifest().version;
  populateLanguageSelect();
  fillForm(await getSettings());
  await refreshCounts();

  document.querySelectorAll('input[type="checkbox"], #cx-version, #cache-ttl').forEach((node) => {
    node.addEventListener('change', () => {
      void saveSettings(readForm()).then(() => showApplyBar());
    });
  });

  // Language has its own handler: besides saving, the options page itself
  // re-translates in place (showApplyBar last, so optSaved uses the new dict).
  select('ui-language').addEventListener('change', () => {
    void (async () => {
      await saveSettings(readForm());
      await initExtPageI18n();
      document.documentElement.lang = currentLocale();
      applyI18n('optionsTitle');
      await refreshCounts();
      showApplyBar();
    })();
  });

  $('apply-now').addEventListener('click', () => void applyToSteamTabs());

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
        const entries = sanitizeChoiceImport(
          JSON.parse(text),
          MAX_IMPORT_ENTRIES,
          MAX_IMPORT_VALUE_LEN,
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
