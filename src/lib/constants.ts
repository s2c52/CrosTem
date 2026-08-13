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
/** Max parallel external fetches per queue (CodeWeavers/AGW/AWACY and
 * Steam). Raised from 2 in F9: with per-source timeouts, breakers and
 * the failure memo bounding misbehavior, 4 lanes halve cold latency. */
export const MAX_CONCURRENT_FETCHES = 4;
/** Per-attempt fetch timeout by host. AWACY gets longer because its
 * games.json is a single ~460 KB blob; Steam's appdetails is a small
 * filtered payload, fast whether fetched same-origin from the store or
 * proxied through the worker from steamcommunity. */
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
/** In-memory per-URL failure memo: a URL that just failed is not
 * re-fetched for this long. Client-side, so it keeps damping even when
 * MV3 kills the worker and resets the breaker. */
export const FETCH_FAILURE_MEMO_MS = 60_000;
/** Hard cap on a single response body. Bounds worker memory if an
 * allowlisted origin is compromised and returns an oversized payload.
 * AWACY's games.json (~460 KB) is the largest legitimate body, so 5 MB
 * leaves ample headroom while refusing anything pathological. */
export const FETCH_MAX_BODY_BYTES = 5 * 1024 * 1024;
/** Consecutive final failures of one origin that open its circuit breaker. */
export const BREAKER_FAILURES = 5;
/** How long an open breaker rejects an origin before allowing traffic again. */
export const BREAKER_COOLDOWN_MS = 2 * 60_000;

// --- Cache lifecycle (cache.ts) ---
/** Stale-while-revalidate window past `expires`: an expired entry this
 * recent is served instantly (marked stale) while the badge revalidates
 * in the background. Compatibility data drifts over weeks, so briefly
 * showing last week's value and silently correcting it is invisible. */
export const CACHE_STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** storage.local usage that triggers eviction (quota is 10MB in MV3). */
export const CACHE_QUOTA_SOFT_BYTES = 4 * 1024 * 1024;
/** Eviction stops once estimated usage drops below this. */
export const CACHE_EVICT_TARGET_BYTES = 3 * 1024 * 1024;
/** Minimum interval between maintenance runs (sweep + eviction). */
export const CACHE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Write-coalescing window: cache.set entries scheduled within it land in
 * ONE storage.local.set (one quota check, one change event) instead of
 * 30-90 individual writes on a cold store page. Short enough that a
 * cross-context reader lags well inside the SWR staleness contract. */
export const CACHE_WRITE_COALESCE_MS = 150;
/** Pending entries that force an early flush before the window closes,
 * bounding both batch size and worst-case loss if the context dies. */
export const CACHE_WRITE_FLUSH_MAX = 24;

// --- Options import (options.ts) ---
/** Max matching-correction entries accepted from an imported JSON file.
 * A real corrections export holds at most a few dozen; a larger file is
 * capped to protect storage.local from bloat. */
export const MAX_IMPORT_ENTRIES = 5_000;
/** Max length of a single imported choice value (a CodeWeavers slug or
 * AGW page name); longer values are dropped as malformed. */
export const MAX_IMPORT_VALUE_LEN = 200;

// --- Library scan (bulk.ts) ---
/** Games resolved concurrently by a bulk scan. Each game fans out up to
 * three source fetches, so two games keep the 4-lane fetch queue busy
 * while leaving room for interactive badges resolving alongside. */
export const SCAN_GAME_CONCURRENCY = 2;
/** Floor between starts of two games that touch the network. Sized to
 * keep Steam appdetails near 40 req/min and the CodeWeavers HTML
 * scraping well under 1 req/s across a ~1000-game scan. */
export const SCAN_MIN_GAME_SPACING_MS = 1_500;
/** A game resolved faster than this never left the local cache — no
 * network round-trip completes that fast — so it consumes no spacing;
 * warm rescans take seconds instead of half an hour. */
export const SCAN_CACHE_FAST_MS = 250;
/** Scan-wide pause after a BreakerOpenError before retrying that game.
 * Must exceed BREAKER_COOLDOWN_MS or the retry meets the same open
 * breaker it is waiting out. */
export const SCAN_BREAKER_WAIT_MS = BREAKER_COOLDOWN_MS + 30_000;
/** Breaker pauses tolerated per scan. When an origin stays down, its
 * breaker keeps reopening; after this many pauses the scan stops
 * waiting and lets the affected games land in the error tally. */
export const SCAN_MAX_BREAKER_PAUSES = 3;

// --- UI / DOM scanning ---
/** Coalescing window for MutationObserver-triggered rescans. */
export const SCAN_DEBOUNCE_MS = 300;
/** Debounce for the popup search-as-you-type input. */
export const SEARCH_DEBOUNCE_MS = 350;
/** IntersectionObserver margin: resolve badges well before they scroll
 * into view (~1 viewport ahead), so they are already painted on arrival. */
export const LAZY_ROOT_MARGIN = '900px';
/** CrossOver version rows shown in the widget breakdown. */
export const MAX_VERSION_ROWS = 3;
/** Search results shown in the popup. */
export const MAX_POPUP_RESULTS = 8;
