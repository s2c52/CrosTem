// Name matching between Steam titles and CodeWeavers entries.
// CodeWeavers has no Steam appid, so we normalize both names and score
// candidates; ambiguous cases are resolved by the user (choice is persisted).
(function (global) {
  'use strict';

  const EDITION_WORDS = [
    'game of the year', 'goty', 'definitive', 'deluxe', 'ultimate', 'complete',
    'enhanced', 'standard', 'gold', 'premium', 'anniversary', 'legendary',
    "director's cut", 'directors cut', 'remastered', 'edition',
  ];

  function normalizeName(name) {
    let s = (name || '').toLowerCase();
    s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); // diacritics
    s = s.replace(/[™®©]/g, ' ');
    s = s.replace(/&/g, ' and ');
    s = s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  // Normalized name with trailing edition qualifiers stripped
  // ("elden ring deluxe edition" -> "elden ring").
  function baseName(name) {
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

  function tokens(s) {
    return new Set(s.split(' ').filter(Boolean));
  }

  function diceCoefficient(a, b) {
    const ta = tokens(a);
    const tb = tokens(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    return (2 * inter) / (ta.size + tb.size);
  }

  function score(steamName, cwName) {
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

  // Returns { confident: entry|null, candidates: [entry] } where each entry
  // is a search result annotated with a .score.
  function rank(steamName, searchResults) {
    const scored = searchResults
      .map((r) => Object.assign({}, r, { score: score(steamName, r.name) }))
      .filter((r) => r.score >= 0.3)
      .sort((x, y) => y.score - x.score);

    let confident = null;
    if (scored.length > 0) {
      const top = scored[0];
      // A unique exact match wins outright; otherwise require a unique
      // near-exact match (no rival at the same level).
      if (top.score === 1 && scored.filter((r) => r.score === 1).length === 1) {
        confident = top;
      } else if (top.score >= 0.95 &&
                 scored.filter((r) => r.score >= 0.95).length === 1) {
        confident = top;
      }
    }
    return { confident, candidates: scored.slice(0, 5) };
  }

  global.CWMatcher = { normalizeName, baseName, score, rank };
})(typeof self !== 'undefined' ? self : this);
