// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Bulk verdict resolution for whole-library scans. Headless twin of the
// per-badge pipeline in auto.ts: same sources, same caches (a scan warms
// the badges and vice versa), but paced for ~1000 sequential games
// instead of a viewport of them, and with per-source failures counted
// instead of swallowed — a scan must be able to say "couldn't ask", not
// file it under "no data". Holds no state: resuming is calling again
// with the games not yet done.
import { agwLookup } from './agw';
import { anticheatLookup } from './awacy';
import { BreakerOpenError, steamDetails } from './client';
import {
  SCAN_BREAKER_WAIT_MS,
  SCAN_CACHE_FAST_MS,
  SCAN_GAME_CONCURRENCY,
  SCAN_MAX_BREAKER_PAUSES,
  SCAN_MIN_GAME_SPACING_MS,
} from './constants';
import { resolveCw } from './cw';
import { logDebug } from './log';
import { getSettings, type Settings } from './settings';
import { computeVerdict } from './verdict';
import type { CwSignal, VerdictLevel } from '../types';

export interface BulkGame {
  appid: string;
  name: string;
}

/** Verdict, or 'error': an enabled source failed and no other source
 * produced a signal — distinct from an honest "no data" unknown. */
export type BulkStatus = VerdictLevel | 'error';

export interface BulkItem {
  appid: string;
  name: string;
  status: BulkStatus;
  /** Steam reports a native macOS build (always status 'green'). */
  native: boolean;
  /** Some enabled source failed but another still produced the verdict. */
  degraded: boolean;
}

export interface BulkTallies {
  green: number;
  yellow: number;
  red: number;
  unknown: number;
  error: number;
  /** Subset of green. */
  native: number;
}

export interface BulkProgress {
  done: number;
  total: number;
  tallies: BulkTallies;
}

export interface ResolveManyOpts {
  signal?: AbortSignal;
  /** Called once per finished game, in completion order. */
  onItem?: (item: BulkItem) => void;
  onProgress?: (progress: BulkProgress) => void;
  concurrency?: number;
  minSpacingMs?: number;
}

export interface ResolveManyOutcome {
  /** false = aborted; items holds what finished before the abort. */
  completed: boolean;
  /** Completion order, not input order. */
  items: BulkItem[];
  tallies: BulkTallies;
}

function emptyTallies(): BulkTallies {
  return { green: 0, yellow: 0, red: 0, unknown: 0, error: 0, native: 0 };
}

/** setTimeout that resolves early (not rejects) on abort: the runners
 * check the signal at their loop heads, so waking up is enough. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(done, ms);
    function done(): void {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    function onAbort(): void {
      clearTimeout(id);
      done();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface OneOutcome {
  status: BulkStatus;
  native: boolean;
  degraded: boolean;
  /** Some enabled source died on an open circuit breaker. */
  breakerHit: boolean;
}

async function resolveOne(game: BulkGame, settings: Settings): Promise<OneOutcome> {
  let steamFailed = false;
  let native = false;
  let name = game.name || null;
  let breakerHit = false;
  const noteBreaker = (e: unknown): void => {
    if (e instanceof BreakerOpenError) breakerHit = true;
  };

  try {
    const details = await steamDetails(game.appid);
    if (details) {
      native = details.mac;
      if (!name) name = details.name;
    }
  } catch (e) {
    // Steam down doesn't kill the game: the sources are other origins
    // and the input name is usually enough to query them.
    steamFailed = true;
    noteBreaker(e);
    logDebug(`bulk: steam details failed for ${game.appid}`, e);
  }

  // Native short-circuit, as in auto.ts — but without the architecture
  // lookup: tallies have no use for it and it costs extra requests.
  if (native) return { status: 'green', native: true, degraded: false, breakerHit: false };

  if (!name) {
    // Nothing to feed the sources. With Steam down this is a "couldn't
    // ask", with Steam up it is a genuinely nameless entry.
    return { status: steamFailed ? 'error' : 'unknown', native: false, degraded: false, breakerHit };
  }

  let cwFailed = false;
  let agwFailed = false;
  let acFailed = false;

  const agwPromise = settings.sources.agw
    ? agwLookup(name, game.appid).catch((e: unknown) => {
        agwFailed = true;
        noteBreaker(e);
        logDebug(`bulk: AGW failed for ${game.appid}`, e);
        return null;
      })
    : Promise.resolve(null);
  const acPromise = settings.sources.anticheat
    ? anticheatLookup(game.appid, name).catch((e: unknown) => {
        acFailed = true;
        noteBreaker(e);
        logDebug(`bulk: anticheat failed for ${game.appid}`, e);
        return null;
      })
    : Promise.resolve(null);

  let cwSignal: CwSignal | null = null;
  if (settings.sources.cw) {
    try {
      const res = await resolveCw(name, game.appid);
      if (res.kind === 'hit') {
        cwSignal = res.app?.mac ? { stars: res.stars, status: res.app.mac.status } : { stars: res.stars };
      }
    } catch (e) {
      cwFailed = true;
      noteBreaker(e);
      logDebug(`bulk: CW failed for ${game.appid}`, e);
    }
  }

  const [agw, ac] = await Promise.all([agwPromise, acPromise]);
  const verdict = computeVerdict(cwSignal, agw, ac);

  const anyFailed = steamFailed || cwFailed || agwFailed || acFailed;
  // "Couldn't ask" beats "no data": an unknown produced while an enabled
  // source was failing is an error, not a fact about the game.
  const status: BulkStatus = verdict === 'unknown' && anyFailed ? 'error' : verdict;
  return { status, native: false, degraded: status !== 'error' && anyFailed, breakerHit };
}

/** Resolve the verdict for every game, paced politely (see the SCAN_*
 * constants), reporting per-item and aggregate progress as it goes. The
 * settings snapshot is taken once — a scan is one consistent pass. */
export async function resolveMany(
  games: BulkGame[],
  opts: ResolveManyOpts = {},
): Promise<ResolveManyOutcome> {
  const { signal, onItem, onProgress } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? SCAN_GAME_CONCURRENCY);
  const spacing = opts.minSpacingMs ?? SCAN_MIN_GAME_SPACING_MS;
  const settings = await getSettings();

  const items: BulkItem[] = [];
  const tallies = emptyTallies();
  let next = 0;
  // Shared start throttle: a runner claims a spacing slot up front and
  // refunds it when the game turns out to have been served from cache.
  let nextStartAt = 0;
  // Shared breaker handling: one pause gates every runner, and a scan
  // tolerates only so many before it stops waiting for a dead origin.
  let pausedUntil = 0;
  let breakerPausesLeft = SCAN_MAX_BREAKER_PAUSES;

  const finish = (game: BulkGame, out: OneOutcome): void => {
    const item: BulkItem = {
      appid: game.appid,
      name: game.name,
      status: out.status,
      native: out.native,
      degraded: out.degraded,
    };
    items.push(item);
    tallies[item.status]++;
    if (item.native) tallies.native++;
    onItem?.(item);
    onProgress?.({ done: items.length, total: games.length, tallies });
  };

  const runner = async (): Promise<void> => {
    while (!signal?.aborted && next < games.length) {
      const game = games[next++];
      if (!game) break;

      const now = Date.now();
      const wait = Math.max(nextStartAt, pausedUntil) - now;
      nextStartAt = Math.max(nextStartAt, now) + spacing;
      if (wait > 0) await sleep(wait, signal);
      if (signal?.aborted) return;

      const startedAt = Date.now();
      let out = await resolveOne(game, settings);
      if (Date.now() - startedAt < SCAN_CACHE_FAST_MS) {
        // Cache hit: hand the unused spacing slot back.
        nextStartAt = Math.max(Date.now(), nextStartAt - spacing);
      }

      // A breaker hit is only worth a scan-wide pause when it damaged
      // the outcome; a clean verdict with, say, Steam's breaker open
      // should not stall every runner for minutes.
      const damaged = out.status === 'error' || out.degraded;
      if (out.breakerHit && damaged && breakerPausesLeft > 0 && !signal?.aborted) {
        breakerPausesLeft--;
        pausedUntil = Math.max(pausedUntil, Date.now() + SCAN_BREAKER_WAIT_MS);
        await sleep(pausedUntil - Date.now(), signal);
        if (signal?.aborted) return;
        out = await resolveOne(game, settings);
      }

      finish(game, out);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runner()));
  return { completed: !signal?.aborted && items.length === games.length, items, tallies };
}
