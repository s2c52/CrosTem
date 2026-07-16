// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseName, normalizeName, rank, score } from '../src/lib/matcher';
import { parseSearchResults } from '../src/lib/parser';

const baldurResults = parseSearchResults(
  readFileSync(join(__dirname, 'fixtures', 'cw_baldur.html'), 'utf8')
    .replace(/<link[^>]*>/g, ''),
);

describe('normalizeName', () => {
  it('quita marcas, diacríticos y puntuación', () => {
    expect(normalizeName('ELDEN RING™')).toBe('elden ring');
    expect(normalizeName('Pokémon')).toBe('pokemon');
    expect(normalizeName("Baldur's Gate 3")).toBe('baldur s gate 3');
    expect(normalizeName('Ori & the Blind Forest')).toBe('ori and the blind forest');
  });
});

describe('baseName', () => {
  it('recorta calificadores de edición al final, incluso encadenados', () => {
    expect(baseName('Divinity: Original Sin 2 — Definitive Edition')).toBe('divinity original sin 2');
    expect(baseName('DARK SOULS™ III Deluxe Edition')).toBe('dark souls iii');
    expect(baseName('Skyrim Legendary Edition')).toBe('skyrim');
  });

  it('no toca calificadores en medio del nombre', () => {
    expect(baseName('Gold Rush: The Game')).toBe('gold rush the game');
  });
});

describe('score', () => {
  it('1 para iguales normalizados, 0.95 para mismo nombre base', () => {
    expect(score('ELDEN RING™', 'Elden Ring')).toBe(1);
    expect(score('Elden Ring Deluxe Edition', 'Elden Ring')).toBe(0.95);
  });

  it('0.8 cuando uno es prefijo del otro', () => {
    expect(score('ELDEN RING', 'ELDEN RING NIGHTREIGN')).toBe(0.8);
  });
});

describe('rank (contra resultados reales de "baldur")', () => {
  it('coincidencia exacta única gana aunque haya rivales casi exactos', () => {
    const r = rank("Baldur's Gate: Enhanced Edition", baldurResults);
    expect(r.confident?.name).toBe("Baldur's Gate: Enhanced Edition");
  });

  it('el juego base gana a sus ediciones', () => {
    const r = rank("Baldur's Gate", baldurResults);
    expect(r.confident?.name).toBe("Baldur's Gate");
  });

  it('secuela numerada no confunde con el original', () => {
    const r = rank("Baldur's Gate 3", baldurResults);
    expect(r.confident?.name).toBe("Baldur's Gate 3");
    expect(r.confident?.slug).toBe('baldurs-gate-3');
  });

  it('sin coincidencias razonables devuelve lista vacía', () => {
    const r = rank('Stardew Valley', baldurResults);
    expect(r.confident).toBeNull();
    expect(r.candidates).toHaveLength(0);
  });

  it('candidatos ordenados por score descendente, máximo 5', () => {
    const r = rank("Baldur's Gate II", baldurResults);
    expect(r.candidates.length).toBeLessThanOrEqual(5);
    const scores = r.candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
