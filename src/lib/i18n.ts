// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// i18n helper. Statuses reported by the sources ("Runs Great",
// "playable"…) are NOT translated — they are quotes from the source (product
// decision); the UI chrome (labels, verdicts, buttons) is translated.

/** chrome.i18n.getMessage with fallback to the key (useful in tests/harness). */
export function t(key: string, substitutions?: string | string[]): string {
  try {
    const msg = chrome.i18n.getMessage(key, substitutions);
    return msg || key;
  } catch {
    return key;
  }
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
