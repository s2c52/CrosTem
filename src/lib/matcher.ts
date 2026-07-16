// Matching de nombres entre títulos de Steam y entradas de CodeWeavers.
// CodeWeavers no conoce el appid de Steam, así que normalizamos ambos nombres
// y puntuamos candidatos; los casos ambiguos los resuelve el usuario (la
// elección se persiste).
import type { CwSearchResult, RankedResult, RankOutcome } from '../types';

const EDITION_WORDS = [
  'game of the year', 'goty', 'definitive', 'deluxe', 'ultimate', 'complete',
  'enhanced', 'standard', 'gold', 'premium', 'anniversary', 'legendary',
  "director's cut", 'directors cut', 'remastered', 'edition',
];

export function normalizeName(name: string): string {
  let s = (name || '').toLowerCase();
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); // diacríticos
  s = s.replace(/[™®©]/g, ' ');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// Nombre normalizado sin calificadores de edición al final
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
  if (ba === bb) return 0.95;
  if (ba.startsWith(bb) || bb.startsWith(ba)) return 0.8;
  return diceCoefficient(ba, bb) * 0.75;
}

export function rank(steamName: string, searchResults: CwSearchResult[]): RankOutcome {
  const scored: RankedResult[] = searchResults
    .map((r) => ({ ...r, score: score(steamName, r.name) }))
    .filter((r) => r.score >= 0.3)
    .sort((x, y) => y.score - x.score);

  let confident: RankedResult | null = null;
  if (scored.length > 0) {
    const top = scored[0];
    // Una coincidencia exacta única gana directamente; si no, exigimos una
    // casi-exacta sin rival al mismo nivel.
    if (top.score === 1 && scored.filter((r) => r.score === 1).length === 1) {
      confident = top;
    } else if (top.score >= 0.95 && scored.filter((r) => r.score >= 0.95).length === 1) {
      confident = top;
    }
  }
  return { confident, candidates: scored.slice(0, 5) };
}
