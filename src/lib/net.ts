// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared fetch policy: per-source timeouts (AbortController), retries
// with exponential backoff + jitter and capped Retry-After support.
// Used by the service worker (external fetches) and by the content
// script's same-origin Steam appdetails fetch. Pure aside from fetch and
// timers, both injectable for tests.
import {
  FETCH_MAX_BODY_BYTES,
  FETCH_MAX_RETRIES,
  FETCH_TIMEOUT_DEFAULT_MS,
  RETRY_AFTER_CAP_MS,
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER_MS,
  SOURCE_TIMEOUTS_MS,
} from './constants';
import type { FetchErrorCode } from '../types';

/** Result of a policy-driven fetch. Assignable to ExtFetchResponse so the
 * service worker can hand it straight back over sendMessage. */
export type FetchOutcome =
  | { ok: true; body: string; finalUrl: string }
  | { ok: false; error: string; code: FetchErrorCode; status?: number };

/** Per-attempt timeout for a URL (host map with a default fallback). */
export function sourceTimeoutMs(url: string): number {
  try {
    return SOURCE_TIMEOUTS_MS[new URL(url).hostname] ?? FETCH_TIMEOUT_DEFAULT_MS;
  } catch {
    return FETCH_TIMEOUT_DEFAULT_MS;
  }
}

/** Worst-case wall time the worker may spend on one URL: every attempt
 * timing out plus the largest possible wait between attempts (a capped
 * Retry-After always exceeds the backoff), plus a margin. The client
 * uses this as its message timeout so it never gives up on a worker
 * that is still legitimately retrying. */
export function messageTimeoutMs(url: string): number {
  const attempts = FETCH_MAX_RETRIES + 1;
  return attempts * sourceTimeoutMs(url) + FETCH_MAX_RETRIES * RETRY_AFTER_CAP_MS + 2_000;
}

export interface FetchPolicyOpts {
  timeoutMs: number;
  /** Extra attempts after the first (default FETCH_MAX_RETRIES). */
  maxRetries?: number;
  credentials?: RequestCredentials;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
  /** Injectable jitter source for deterministic tests. */
  rand?: () => number;
}

/** Retry-After arrives as delta-seconds or as an HTTP-date. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - Date.now(), 0), RETRY_AFTER_CAP_MS);
}

function tooLarge(bytes: number): FetchOutcome {
  return { ok: false, error: `response too large (${bytes} bytes)`, code: 'too-large' };
}

function isRetryable(out: FetchOutcome): boolean {
  if (out.ok) return false;
  // A timed-out attempt is final: the per-source timeouts are already
  // generous (a hung source will hang again), and retrying it triples
  // the user-visible worst case while holding a queue slot.
  if (out.code === 'network') return true;
  return out.code === 'http' && (out.status === 429 || (out.status ?? 0) >= 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AttemptResult {
  outcome: FetchOutcome;
  /** Present only on an HTTP error carrying a Retry-After header. */
  retryAfterMs?: number;
}

async function attempt(url: string, opts: FetchPolicyOpts): Promise<AttemptResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const init: RequestInit = { signal: controller.signal };
    if (opts.credentials) init.credentials = opts.credentials;
    const res = await fetchFn(url, init);
    if (!res.ok) {
      const result: AttemptResult = {
        outcome: { ok: false, error: `HTTP ${res.status}`, code: 'http', status: res.status },
      };
      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      if (retryAfterMs !== undefined) result.retryAfterMs = retryAfterMs;
      return result;
    }
    // Refuse an oversized body before buffering it: a compromised
    // allowlisted origin should not be able to exhaust worker memory.
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > FETCH_MAX_BODY_BYTES) {
      return { outcome: tooLarge(declared) };
    }
    // The timeout also covers body download: abort() cancels text().
    const body = await res.text();
    // Backstop for chunked responses that omit Content-Length: the body
    // is already in memory, but we still refuse to hand it downstream.
    if (body.length > FETCH_MAX_BODY_BYTES) {
      return { outcome: tooLarge(body.length) };
    }
    return { outcome: { ok: true, body, finalUrl: res.url } };
  } catch (e) {
    if (controller.signal.aborted) {
      return {
        outcome: { ok: false, error: `timed out after ${opts.timeoutMs}ms`, code: 'timeout' },
      };
    }
    return {
      outcome: { ok: false, error: String(e instanceof Error ? e.message : e), code: 'network' },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch with timeout + retry policy. Never throws: always resolves to a
 * FetchOutcome (matching the service worker's response contract). */
export async function fetchWithPolicy(url: string, opts: FetchPolicyOpts): Promise<FetchOutcome> {
  const maxRetries = opts.maxRetries ?? FETCH_MAX_RETRIES;
  const rand = opts.rand ?? Math.random;
  let result = await attempt(url, opts);
  for (let retry = 0; retry < maxRetries && isRetryable(result.outcome); retry++) {
    const backoff = RETRY_BASE_DELAY_MS * 2 ** retry + rand() * RETRY_JITTER_MS;
    await sleep(result.retryAfterMs ?? backoff);
    result = await attempt(url, opts);
  }
  return result.outcome;
}
