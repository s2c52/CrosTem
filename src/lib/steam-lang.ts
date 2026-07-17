// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam page language detection. The injected UI follows the language the
// user reads Steam in (not the browser UI language), so we detect it from
// the page itself and map Steam's own codes to BCP-47 dictionary names.

/**
 * Steam API language code → BCP-47 tag, one entry per language the Steam
 * store UI ships in (Arabic exists only for game depots, not the store UI).
 */
export const STEAM_TO_BCP47: Record<string, string> = {
  english: 'en',
  spanish: 'es',
  latam: 'es-419',
  schinese: 'zh-CN',
  tchinese: 'zh-TW',
  portuguese: 'pt-PT',
  brazilian: 'pt-BR',
  koreana: 'ko',
  japanese: 'ja',
  french: 'fr',
  german: 'de',
  italian: 'it',
  dutch: 'nl',
  russian: 'ru',
  ukrainian: 'uk',
  polish: 'pl',
  czech: 'cs',
  hungarian: 'hu',
  romanian: 'ro',
  bulgarian: 'bg',
  greek: 'el',
  danish: 'da',
  finnish: 'fi',
  swedish: 'sv',
  norwegian: 'nb',
  turkish: 'tr',
  thai: 'th',
  vietnamese: 'vi',
  indonesian: 'id',
  malay: 'ms',
};

/** Locales we ship a dictionary for (public/locales/<code>.json). */
export const SUPPORTED_LOCALES: readonly string[] = [...new Set(Object.values(STEAM_TO_BCP47))];

/**
 * Endonym (native name) per supported locale, for the language picker.
 * Hardcoded instead of Intl.DisplayNames: deterministic output and polished
 * forms for es-419, zh-CN/zh-TW and nb; endonyms are the same in every UI
 * language.
 */
export const LOCALE_NATIVE_NAMES: Record<string, string> = {
  bg: 'Български',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español (España)',
  'es-419': 'Español (Latinoamérica)',
  fi: 'Suomi',
  fr: 'Français',
  hu: 'Magyar',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  ms: 'Bahasa Melayu',
  nb: 'Norsk (bokmål)',
  nl: 'Nederlands',
  pl: 'Polski',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  ro: 'Română',
  ru: 'Русский',
  sv: 'Svenska',
  th: 'ไทย',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

// Base languages whose bare tag is not itself a supported locale.
const BASE_FALLBACK: Record<string, string> = {
  pt: 'pt-PT',
  zh: 'zh-CN',
  no: 'nb',
  nn: 'nb',
};

const SUPPORTED_BY_LOWER = new Map(SUPPORTED_LOCALES.map((code) => [code.toLowerCase(), code]));

/**
 * Normalize a BCP-47-ish tag to a supported locale, or null. Case-insensitive
 * (steamcommunity emits html[lang]="zh-cn"); unknown regions fall back to the
 * base language ("fr-CA" → "fr", "pt" → "pt-PT").
 */
export function normalizeToSupported(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const lower = tag.trim().toLowerCase();
  if (!lower) return null;
  const exact = SUPPORTED_BY_LOWER.get(lower);
  if (exact) return exact;
  const base = lower.split('-')[0] ?? lower;
  return SUPPORTED_BY_LOWER.get(base) ?? BASE_FALLBACK[base] ?? null;
}

/**
 * Steam language code of the page ("koreana", "latam"…), or null.
 * Cascade: #application_config data-config → ?l= on script src →
 * Steam_Language cookie. All readable from an isolated content script.
 */
export function detectSteamLanguage(doc: Document = document): string | null {
  const config = doc.getElementById('application_config')?.getAttribute('data-config');
  if (config) {
    try {
      const lang = (JSON.parse(config) as Record<string, unknown>).LANGUAGE;
      if (typeof lang === 'string' && lang in STEAM_TO_BCP47) return lang;
    } catch {
      // Malformed config — keep falling through the cascade.
    }
  }
  for (const script of doc.querySelectorAll('script[src]')) {
    const lang = /[?&]l=([a-z_]+)/.exec(script.getAttribute('src') ?? '')?.[1];
    if (lang && lang in STEAM_TO_BCP47) return lang;
  }
  const cookieLang = /(?:^|;\s*)Steam_Language=([A-Za-z_]+)/
    .exec(doc.cookie ?? '')?.[1]
    ?.toLowerCase();
  if (cookieLang && cookieLang in STEAM_TO_BCP47) return cookieLang;
  return null;
}

/**
 * Supported locale of the current Steam page: Steam's own signals first,
 * then html[lang] as a cross-check, defaulting to English.
 */
export function detectPageLocale(doc: Document = document): string {
  const mapped = normalizeToSupported(STEAM_TO_BCP47[detectSteamLanguage(doc) ?? '']);
  return mapped ?? normalizeToSupported(doc.documentElement.lang) ?? 'en';
}
