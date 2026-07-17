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
/** Per-attempt fetch timeout by host. AWACY gets longer because its
 * games.json is a single ~460 KB blob; Steam is same-origin and fast. */
export const SOURCE_TIMEOUTS_MS: Readonly<Record<string, number>> = {
  'store.steampowered.com': 5_000,
  'www.codeweavers.com': 8_000,
  'www.applegamingwiki.com': 8_000,
  'raw.githubusercontent.com': 15_000,
};
/** Per-attempt timeout for hosts outside SOURCE_TIMEOUTS_MS. */
export const FETCH_TIMEOUT_DEFAULT_MS = 10_000;
/** Extra attempts after the first one (429/5xx/network/timeout only). */
export const FETCH_MAX_RETRIES = 2;
/** Base for the exponential backoff between retries. */
export const RETRY_BASE_DELAY_MS = 500;
/** Random jitter added to each backoff delay. */
export const RETRY_JITTER_MS = 250;
/** Upper bound honored for a server-sent Retry-After header. */
export const RETRY_AFTER_CAP_MS = 10_000;
/** Consecutive final failures of one origin that open its circuit breaker. */
export const BREAKER_FAILURES = 5;
/** How long an open breaker rejects an origin before allowing traffic again. */
export const BREAKER_COOLDOWN_MS = 2 * 60_000;

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
