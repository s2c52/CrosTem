// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Tuning constants shared across the extension. Every threshold that
// shapes behavior lives here with a name and a rationale.

// --- Name matching (matcher.ts) ---
/** Same base name once edition qualifiers are stripped: near-exact. */
export const SCORE_BASE_MATCH = 0.95;
/** One base name is a prefix of the other. */
export const SCORE_PREFIX_MATCH = 0.8;
/** Weight applied to the token Dice coefficient (fuzzy tail). */
export const SCORE_DICE_WEIGHT = 0.75;
/** Candidates scoring below this are discarded outright. */
export const SCORE_MIN_CANDIDATE = 0.3;
/** Minimum top score to auto-pick without asking (needs no rival at the same level). */
export const SCORE_CONFIDENT = SCORE_BASE_MATCH;
/** Maximum candidates offered to the user in the picker. */
export const MAX_CANDIDATES = 5;

// --- Verdict (verdict.ts) ---
/** CodeWeavers stars at or above this count as a good signal. */
export const CW_STARS_GOOD = 4;
/** CodeWeavers stars at or below this count as a bad signal. */
export const CW_STARS_BAD = 1;

// --- Native arch detection (arch.ts) ---
/** First full year with Apple Silicon Macs on sale (the M1 shipped in
 * November 2020): a native Mac game released from this year on is
 * assumed to ship an ARM binary. */
export const APPLE_SILICON_YEAR = 2021;

// --- Networking ---
/** Max parallel external fetches per queue (CodeWeavers/AGW/AWACY and Steam). */
export const MAX_CONCURRENT_FETCHES = 2;
/** Give up on a service-worker-proxied fetch after this long. */
export const FETCH_TIMEOUT_MS = 10_000;

// --- UI / DOM scanning ---
/** Coalescing window for MutationObserver-triggered rescans. */
export const SCAN_DEBOUNCE_MS = 300;
/** Debounce for the popup search-as-you-type input. */
export const SEARCH_DEBOUNCE_MS = 350;
/** IntersectionObserver margin: resolve badges just before they scroll into view. */
export const LAZY_ROOT_MARGIN = '150px';
/** CrossOver version rows shown in the widget breakdown. */
export const MAX_VERSION_ROWS = 3;
/** Search results shown in the popup. */
export const MAX_POPUP_RESULTS = 8;
