// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Primed verdicts: a compact persisted map of appid -> verdict code, so
// badges paint the right color the moment a tile appears — before any
// resolution completes. The real resolution replaces the primed badge in
// place (renderBadge rebuilds the element), so a correct guess refines
// seamlessly and a stale one is corrected.
//
// Unknown/error outcomes are never primed: an appearing dot reads as an
// answer arriving, while a gray dot flipping to a color reads as a wrong
// answer corrected. A resolution that comes back empty records a
// DELETION instead, so a stale color stops priming on the next page.
//
// The index lives OUTSIDE the `cache:` prefix: the sweep, the quota
// eviction and a cache clear must never silently destroy it (the options
// clear-cache removes it explicitly — user intent is a full reset).

import { PRIMED_FLUSH_MS, PRIMED_INDEX_MAX } from './constants';
import { debounce } from './debounce';
import { isRecord } from './guards';
import { logDebug } from './log';
import type { ResolveResult, VerdictLevel } from '../types';

export const PRIMED_INDEX_KEY = 'verdict:index';

/** 'n' = native; 'g'/'y'/'r' = the verdict traffic light. */
export type PrimedCode = 'n' | 'g' | 'y' | 'r';

interface PrimedIndex {
  v: 1;
  e: Record<string, PrimedCode>;
}

/** The code a verdict level contributes, or null (never primed). */
export function codeForLevel(level: VerdictLevel): PrimedCode | null {
  switch (level) {
    case 'green':
      return 'g';
    case 'yellow':
      return 'y';
    case 'red':
      return 'r';
    case 'unknown':
      return null;
  }
}

/** The code a finished badge resolution contributes, or null. */
export function codeForResult(result: ResolveResult): PrimedCode | null {
  switch (result.kind) {
    case 'native':
      return 'n';
    case 'stars':
    case 'ambiguous':
    case 'dot':
      return codeForLevel(result.level);
    case 'none':
      return null;
  }
}

/** The ResolveResult a primed code paints — the same shapes the real
 * renderer produces, so the later render replaces it seamlessly. */
export function resultForCode(code: PrimedCode): ResolveResult {
  if (code === 'n') return { kind: 'native', arch: null };
  return { kind: 'dot', level: code === 'g' ? 'green' : code === 'y' ? 'yellow' : 'red' };
}

function parseIndex(raw: unknown): Record<string, PrimedCode> {
  if (!isRecord(raw) || raw.v !== 1 || !isRecord(raw.e)) return {};
  const out: Record<string, PrimedCode> = {};
  for (const [appid, code] of Object.entries(raw.e)) {
    if (code === 'n' || code === 'g' || code === 'y' || code === 'r') out[appid] = code;
  }
  return out;
}

/** One read per context. Absent or broken index degrades to an empty
 * map — exactly the pre-priming behavior. */
export async function loadPrimedIndex(): Promise<Map<string, PrimedCode>> {
  try {
    const obj = await chrome.storage.local.get(PRIMED_INDEX_KEY);
    return new Map(Object.entries(parseIndex(obj[PRIMED_INDEX_KEY])));
  } catch (e) {
    logDebug('primed index unavailable', e);
    return new Map();
  }
}

// Deltas coalesce per context and flush as one read-merge-write. Two
// tabs can last-writer-win each other's deltas; acceptable — the loss is
// a paint hint that regenerates on the next resolution, and correctness
// never depends on it. null = delete (see the header note).
const pendingDelta = new Map<string, PrimedCode | null>();

const scheduleFlush = debounce(() => {
  void flushDelta();
}, PRIMED_FLUSH_MS);

async function flushDelta(): Promise<void> {
  if (pendingDelta.size === 0) return;
  const delta = new Map(pendingDelta);
  pendingDelta.clear();
  try {
    const obj = await chrome.storage.local.get(PRIMED_INDEX_KEY);
    const entries = parseIndex(obj[PRIMED_INDEX_KEY]);
    let changed = false;
    for (const [appid, code] of delta) {
      if (code === null) {
        if (appid in entries) {
          delete entries[appid];
          changed = true;
        }
      } else if (entries[appid] !== code) {
        entries[appid] = code;
        changed = true;
      }
    }
    if (!changed) return; // steady-state pages write nothing
    let next: PrimedIndex = { v: 1, e: entries };
    if (Object.keys(entries).length > PRIMED_INDEX_MAX) {
      // No timestamps, so no LRU: reset to this context's delta. The
      // only cost is first-paints until the index regrows.
      const fresh: Record<string, PrimedCode> = {};
      for (const [appid, code] of delta) {
        if (code !== null) fresh[appid] = code;
      }
      next = { v: 1, e: fresh };
    }
    await chrome.storage.local.set({ [PRIMED_INDEX_KEY]: next });
  } catch (e) {
    // Fire and forget by design: priming must never break a resolution.
    logDebug('primed index flush failed', e);
  }
}

/** Records the outcome a resolution just produced. A null code records a
 * deletion (stale colors must stop priming); a null/absent appid is a
 * no-op. */
export function notePrimed(
  appid: string | null | undefined,
  code: PrimedCode | null,
): void {
  if (!appid) return;
  pendingDelta.set(appid, code);
  scheduleFlush();
}
