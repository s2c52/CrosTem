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
