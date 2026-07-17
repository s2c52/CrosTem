// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Name matching between Steam titles and CodeWeavers entries.
// CodeWeavers does not know the Steam appid, so we normalize both names
// and score candidates; ambiguous cases are resolved by the user (the
// choice is persisted).
import {
  MAX_CANDIDATES,
  SCORE_BASE_MATCH,
  SCORE_CONFIDENT,
  SCORE_DICE_WEIGHT,
  SCORE_MIN_CANDIDATE,
  SCORE_PREFIX_MATCH,
} from './constants';
import type { CwSearchResult, RankedResult, RankOutcome } from '../types';

const EDITION_WORDS = [
  'game of the year',
  'goty',
  'definitive',
  'deluxe',
  'ultimate',
  'complete',
  'enhanced',
  'standard',
  'gold',
  'premium',
  'anniversary',
  'legendary',
  "director's cut",
  'directors cut',
  'remastered',
  'edition',
];

export function normalizeName(name: string): string {
  let s = (name || '').toLowerCase();
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); // diacritics
  s = s.replace(/[™®©]/g, ' ');
  s = s.replace(/&/g, ' and ');
  s = s
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

// Normalized name without trailing edition qualifiers
// ("elden ring deluxe edition" -> "elden ring").
export function baseName(name: string): string {
  let s = normalizeName(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of EDITION_WORDS) {
      const nw = normalizeName(w);
      if (s.endsWith(' ' + nw)) {
        s = s.slice(0, -nw.length - 1).trim();
        changed = true;
      }
    }
  }
  return s;
}

function tokens(s: string): Set<string> {
  return new Set(s.split(' ').filter(Boolean));
}

function diceCoefficient(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

export function score(steamName: string, cwName: string): number {
  const a = normalizeName(steamName);
  const b = normalizeName(cwName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = baseName(steamName);
  const bb = baseName(cwName);
  if (ba === bb) return SCORE_BASE_MATCH;
  if (ba.startsWith(bb) || bb.startsWith(ba)) return SCORE_PREFIX_MATCH;
  return diceCoefficient(ba, bb) * SCORE_DICE_WEIGHT;
}

export function rank(steamName: string, searchResults: CwSearchResult[]): RankOutcome {
  const scored: RankedResult[] = searchResults
    .map((r) => ({ ...r, score: score(steamName, r.name) }))
    .filter((r) => r.score >= SCORE_MIN_CANDIDATE)
    .sort((x, y) => y.score - x.score);

  let confident: RankedResult | null = null;
  const top = scored[0];
  if (top) {
    // A single exact match wins outright; otherwise we require a
    // near-exact one with no rival at the same level.
    if (top.score === 1 && scored.filter((r) => r.score === 1).length === 1) {
      confident = top;
    } else if (
      top.score >= SCORE_CONFIDENT &&
      scored.filter((r) => r.score >= SCORE_CONFIDENT).length === 1
    ) {
      confident = top;
    }
  }
  return { confident, candidates: scored.slice(0, MAX_CANDIDATES) };
}
