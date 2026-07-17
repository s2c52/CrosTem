// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Toolbar popup: verdict of the game in the active tab, manual search
// against CodeWeavers, quick surface toggles, extension status and
// source shortcuts. Uses the same client/cache/pipeline as the widget.
import { resolveNativeArch } from '../lib/arch';
import { storageKeys } from '../lib/cache';
import { appUrl, search, steamDetails } from '../lib/client';
import { MAX_POPUP_RESULTS, SEARCH_DEBOUNCE_MS } from '../lib/constants';
import { AWACY_SITE } from '../lib/awacy';
import { debounce } from '../lib/debounce';
import { applyI18n, currentLocale, initI18n, t } from '../lib/i18n';
import { logDebug } from '../lib/log';
import { ctLogo } from '../lib/logo';
import { resolveGame } from '../lib/resolve';
import { getSettings, saveSettings, mergeSettings } from '../lib/settings';
import { starsEl } from '../lib/widget';
import '../styles.css';

const STEAM_APP_RE = /^https:\/\/store\.steampowered\.com\/app\/(\d+)/;
const TOGGLE_SAVE_DEBOUNCE_MS = 300; // storage.sync write quota is per minute

function mustGet(id: string): HTMLElement {
  const node = document.getElementById(id);
  // The popup owns its DOM: a missing id is a programming error.
  if (!node) throw new Error(`CrosTem popup: missing element #${id}`);
  return node;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const queryEl = mustGet('query') as HTMLInputElement;
const resultsEl = mustGet('results');
const optionsLink = mustGet('open-options') as HTMLAnchorElement;

document.querySelector('.logo')?.replaceWith(ctLogo(18));
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});

// --- Search -----------------------------------------------------------

let lastQuery = '';

async function runSearch(q: string): Promise<void> {
  lastQuery = q;
  resultsEl.textContent = '';
  if (q.trim().length < 2) return;
  const loading = el('div', 'muted', '…');
  resultsEl.appendChild(loading);
  try {
    const results = await search(q);
    if (lastQuery !== q) return; // arrived late: there is a newer search
    resultsEl.textContent = '';
    if (results.length === 0) {
      resultsEl.appendChild(el('div', 'muted', t('popupNoResults')));
      return;
    }
    for (const r of results.slice(0, MAX_POPUP_RESULTS)) {
      const a = el('a', 'result') as HTMLAnchorElement;
      a.href = appUrl(r.slug);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const name = el('div', 'name', r.name);
      const meta = el('div', 'meta');
      meta.appendChild(starsEl(r.stars));
      meta.appendChild(document.createTextNode(r.company ? ` · ${r.company}` : ''));
      a.append(name, meta);
      resultsEl.appendChild(a);
    }
  } catch {
    if (lastQuery !== q) return;
    resultsEl.textContent = '';
    resultsEl.appendChild(el('div', 'muted', t('popupError')));
  }
}

const debouncedSearch = debounce(() => void runSearch(queryEl.value), SEARCH_DEBOUNCE_MS);
queryEl.addEventListener('input', debouncedSearch);

// Keyboard: arrows move through results, Enter opens (native anchor
// behavior), Esc clears the query and returns focus to the input.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    queryEl.value = '';
    resultsEl.textContent = '';
    queryEl.focus();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const links = [...resultsEl.querySelectorAll<HTMLAnchorElement>('a.result')];
  if (links.length === 0) return;
  e.preventDefault();
  const idx = links.indexOf(document.activeElement as HTMLAnchorElement);
  const next =
    e.key === 'ArrowDown'
      ? idx + 1 >= links.length
        ? 0
        : idx + 1
      : idx <= 0
        ? links.length - 1
        : idx - 1;
  links[next]?.focus();
});

// --- Active-tab mini verdict ------------------------------------------

function miniStars(n: number | null): HTMLElement {
  const line = el('div', 'mini-line');
  line.appendChild(starsEl(n));
  return line;
}

async function initCurrentTab(): Promise<void> {
  const section = mustGet('current-game');
  const body = mustGet('current-game-body');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const appid = tab?.url?.match(STEAM_APP_RE)?.[1];
    if (!appid) return; // not a Steam game page: section stays hidden
    section.hidden = false;
    body.textContent = '';
    const skeleton = el('div', 'crostem-skeleton mini-skeleton');
    skeleton.setAttribute('role', 'status');
    skeleton.setAttribute('aria-label', t('checking'));
    body.appendChild(skeleton);

    const steam = await steamDetails(appid);
    const gameName = steam?.name ?? tab?.title?.replace(/ on Steam$/i, '') ?? '';
    if (!gameName) {
      section.hidden = true;
      return;
    }
    body.textContent = '';
    body.appendChild(el('div', 'mini-name', gameName));

    if (steam?.mac) {
      const line = el('div', 'mini-line');
      line.appendChild(starsEl(5));
      line.appendChild(el('span', 'crostem-native-badge', t('nativeBadge')));
      const archTag = el('span', 'crostem-arch-tag');
      line.appendChild(archTag);
      body.appendChild(line);
      void resolveNativeArch(gameName, appid)
        .then((arch) => {
          if (arch) {
            archTag.textContent =
              t(arch.arch === 'm-series' ? 'archMShort' : 'archIntelShort') +
              (arch.approximate ? ' ~' : '');
          }
        })
        .catch((e: unknown) => logDebug('popup arch resolution failed', e));
      return;
    }

    const { cw, verdict } = await resolveGame(gameName, appid, { loadAppPage: false });
    const banner = el('div', 'crostem-banner mini-banner crostem-banner-' + verdict);
    banner.setAttribute('role', 'status');
    banner.appendChild(
      el('span', 'crostem-banner-label crostem-verdict-' + verdict, t('verdict_' + verdict)),
    );
    body.appendChild(banner);
    if (cw.kind === 'hit') body.appendChild(miniStars(cw.stars));
  } catch (e) {
    logDebug('popup current-tab verdict failed', e);
    section.hidden = true;
  }
}

// --- Surface toggles ---------------------------------------------------

const SURFACE_IDS = ['app', 'capsules', 'search', 'wishlist'] as const;

function surfaceInput(key: (typeof SURFACE_IDS)[number]): HTMLInputElement {
  return mustGet('surface-' + key) as HTMLInputElement;
}

async function initToggles(): Promise<void> {
  const settings = await getSettings();
  for (const key of SURFACE_IDS) surfaceInput(key).checked = settings.surfaces[key];
  const save = debounce(() => {
    void saveSettings(
      mergeSettings({
        ...settings,
        surfaces: {
          app: surfaceInput('app').checked,
          capsules: surfaceInput('capsules').checked,
          search: surfaceInput('search').checked,
          wishlist: surfaceInput('wishlist').checked,
        },
      }),
    ).then(() => flashStatus(t('optSaved')));
  }, TOGGLE_SAVE_DEBOUNCE_MS);
  for (const key of SURFACE_IDS) surfaceInput(key).addEventListener('change', save);
}

// --- Status + quick links ----------------------------------------------

let statusTimer: ReturnType<typeof setTimeout> | undefined;

function flashStatus(msg: string): void {
  const status = mustGet('ext-status');
  status.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => void renderStatus(), 2000);
}

async function renderStatus(): Promise<void> {
  const settings = await getSettings();
  const active = Object.values(settings.sources).filter(Boolean).length;
  const cached = (await storageKeys('cache:')).length;
  mustGet('ext-status').textContent =
    `${t('popupStatusSources', String(active))} · ${t('optCacheCount', String(cached))}`;
}

function initQuickLinks(): void {
  const nav = mustGet('quick-links');
  nav.setAttribute('aria-label', t('popupLinks'));
  const links: Array<[string, string]> = [
    ['CodeWeavers', 'https://www.codeweavers.com/compatibility'],
    ['AppleGamingWiki', 'https://www.applegamingwiki.com/'],
    ['AreWeAntiCheatYet', AWACY_SITE],
  ];
  for (const [name, url] of links) {
    const a = el('a', 'quick-link', name) as HTMLAnchorElement;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    nav.appendChild(a);
  }
}

void (async () => {
  // The dictionary must be ready before anything renders text.
  await initI18n();
  document.documentElement.lang = currentLocale();
  applyI18n();
  queryEl.placeholder = t('popupSearchPlaceholder');
  optionsLink.textContent = t('popupOptions');
  initQuickLinks();
  void initToggles();
  void renderStatus();
  void initCurrentTab();
})();
