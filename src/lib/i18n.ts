// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// i18n helper. Dictionaries live in public/locales/<bcp47>.json and are
// loaded at runtime so the injected UI can follow the Steam page language
// (chrome.i18n only follows the browser language). Statuses reported by the
// sources ("Runs Great", "playable"…) are NOT translated — they are quotes
// from the source (product decision); the UI chrome (labels, verdicts,
// buttons) is translated.

import { getSettings, type Settings } from './settings';
import { detectPageLocale, normalizeToSupported } from './steam-lang';

interface RawMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

let dict: Record<string, string> | null = null;
let locale = 'en';

/**
 * Flatten messages.json-style entries to plain templates, resolving named
 * placeholders ("$VER$" → its content, "$1") to positional ones.
 */
export function compileMessages(raw: Record<string, RawMessage>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw)) {
    let message = entry.message;
    for (const [name, ph] of Object.entries(entry.placeholders ?? {})) {
      message = message.replaceAll('$' + name.toUpperCase() + '$', ph.content);
    }
    out[key] = message;
  }
  return out;
}

async function loadDict(code: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(chrome.runtime.getURL('locales/' + code + '.json'));
    if (!res.ok) return null;
    return compileMessages((await res.json()) as Record<string, RawMessage>);
  } catch {
    return null;
  }
}

async function storedUiLang(): Promise<string | null> {
  try {
    const stored = (await chrome.storage.local.get('uiLang')).uiLang;
    return typeof stored === 'string' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the locale and load its dictionary; call (and await) once per
 * entry point before the first render. Content scripts pass the detected
 * page locale; extension pages (popup/options/onboarding) omit it and get
 * the last language seen on Steam, falling back to the browser language.
 */
export async function initI18n(lang?: string): Promise<void> {
  const code =
    normalizeToSupported(lang) ??
    normalizeToSupported(await storedUiLang()) ??
    normalizeToSupported(navigator.language) ??
    'en';
  dict = await loadDict(code);
  if (dict) {
    locale = code;
    return;
  }
  locale = 'en';
  if (code !== 'en') dict = await loadDict('en');
}

/** Locale the dictionary was loaded for (for document.documentElement.lang). */
export function currentLocale(): string {
  return locale;
}

/**
 * Remember the page locale so extension pages without a Steam page behind
 * them (popup/options/onboarding) can reuse it. Content scripts call it
 * after initI18n; writes only on change. Always stores the detected page
 * locale, never a manual override, so "Auto" restores the last Steam
 * language seen.
 */
export async function persistUiLang(code: string = locale): Promise<void> {
  try {
    if ((await storedUiLang()) !== code) await chrome.storage.local.set({ uiLang: code });
  } catch {
    // Storage unavailable (tests/harness) — remembering the language is best-effort.
  }
}

/**
 * Init i18n for a content script: the manual language override if set,
 * else the Steam page language. Returns the settings so callers can check
 * their surface without a second (memoized anyway) getSettings call.
 */
export async function initContentI18n(doc: Document = document): Promise<Settings> {
  const settings = await getSettings();
  const page = detectPageLocale(doc);
  await initI18n(settings.language === 'auto' ? page : settings.language);
  void persistUiLang(page);
  return settings;
}

/**
 * Init i18n for an extension page (popup/options/onboarding): the manual
 * language override if set, else the stored uiLang → browser cascade.
 */
export async function initExtPageI18n(): Promise<void> {
  const { language } = await getSettings();
  await initI18n(language === 'auto' ? undefined : language);
}

/** Translate a key, with fallback to the key itself (useful in tests/harness). */
export function t(key: string, substitutions?: string | string[]): string {
  const template = dict?.[key];
  if (template === undefined) return key;
  const subs =
    substitutions === undefined
      ? []
      : Array.isArray(substitutions)
        ? substitutions
        : [substitutions];
  return template.replace(/\$(\d)/g, (_, digit: string) => subs[Number(digit) - 1] ?? '');
}

/**
 * Fill every [data-i18n] element from the locale; optionally translate
 * the document title too. Shared by popup, options and onboarding.
 */
export function applyI18n(titleKey?: string): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (key) node.textContent = t(key);
  });
  if (titleKey) document.title = t(titleKey);
}
