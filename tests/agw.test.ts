// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Tests for parsing the AppleGamingWiki cargoquery API against a real
// captured response (fixture captured 2026-07-16).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/client', () => ({ fetchExt: vi.fn() }));
vi.mock('../src/lib/cache', () => ({
  getSourceChoice: vi.fn().mockResolvedValue(undefined),
  getSwr: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  ttlResult: vi.fn().mockResolvedValue(1000),
  TTL_NEGATIVE: 1000,
}));

import { agwLookupDetailed, agwPageUrl, likeWhere, parseCargoResponse } from '../src/lib/agw';
import { fetchExt } from '../src/lib/client';
import { must } from './helpers';

const body = readFileSync(join(__dirname, 'fixtures', 'agw_elden.json'), 'utf8');

describe('parseCargoResponse (AGW)', () => {
  it('mapea la respuesta real de Elden Ring', () => {
    const rows = parseCargoResponse(body);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const elden = must(
      rows.find((r) => r.page === 'Elden Ring'),
      'Elden Ring row',
    );
    expect(elden).toMatchObject({
      crossover: 'playable',
      parallels: 'unplayable',
      native: 'na',
      rosetta2: 'na',
    });
  });

  it('normaliza estados desconocidos y apóstrofes tipográficos', () => {
    const rows = parseCargoResponse(
      JSON.stringify({
        cargoquery: [
          {
            title: {
              Page: 'A',
              crossover: 'Doesn’t work',
              parallels: 'INVENTED',
              native: '',
              'rosetta 2': 'perfect',
            },
          },
        ],
      }),
    );
    const row = must(rows[0]);
    expect(row.crossover).toBe("doesn't work");
    expect(row.parallels).toBe('unknown');
    expect(row.native).toBe('unknown');
    expect(row.rosetta2).toBe('perfect');
  });

  it('respuesta sin cargoquery devuelve []', () => {
    expect(parseCargoResponse('{}')).toEqual([]);
  });
});

describe('agwPageUrl', () => {
  it('convierte espacios en guiones bajos', () => {
    expect(agwPageUrl('Elden Ring')).toBe('https://www.applegamingwiki.com/wiki/Elden_Ring');
  });
});

describe('likeWhere', () => {
  it('sin subtítulo genera un solo patrón', () => {
    expect(likeWhere('Elden Ring')).toBe("_pageName LIKE '%elden%ring%'");
  });

  it('añade el patrón del prefijo antes del subtítulo (":")', () => {
    expect(likeWhere('The Witcher 3: Wild Hunt')).toBe(
      "_pageName LIKE '%the%witcher%3%wild%hunt%' OR _pageName LIKE '%the%witcher%3%'",
    );
  });

  it('reconoce el separador " - " pero no guiones dentro de palabra', () => {
    expect(likeWhere('Divinity: Original Sin 2 - Definitive Edition')).toBe(
      "_pageName LIKE '%divinity%original%sin%2%' OR _pageName LIKE '%divinity%'",
    );
    expect(likeWhere("Marvel's Spider-Man Remastered")).toBe(
      "_pageName LIKE '%marvel%s%spider%man%'",
    );
  });

  it('omite el prefijo cuando coincide con el patrón completo', () => {
    expect(likeWhere('Grand Theft Auto V Enhanced')).toBe(
      "_pageName LIKE '%grand%theft%auto%v%'",
    );
  });
});

const cargo = (pages: string[]): string =>
  JSON.stringify({
    cargoquery: pages.map((p) => ({
      title: {
        Page: p,
        crossover: 'playable',
        parallels: 'playable',
        native: 'na',
        'rosetta 2': 'na',
      },
    })),
  });

describe('agwLookupDetailed (candidato único)', () => {
  it('no auto-elige una página más corta: la precuela de una secuela', async () => {
    vi.mocked(fetchExt).mockResolvedValue(cargo(['Kingdom Come: Deliverance']));
    const r = await agwLookupDetailed('Kingdom Come: Deliverance II');
    expect(r.result).toBeNull();
    expect(r.candidates).toHaveLength(1);
  });

  it('sí auto-elige una página que extiende el nombre (DLC/edición)', async () => {
    vi.mocked(fetchExt).mockResolvedValue(
      cargo(['The Witcher 3: Wild Hunt - Blood and Wine']),
    );
    const r = await agwLookupDetailed('The Witcher 3: Wild Hunt');
    expect(r.result?.page).toBe('The Witcher 3: Wild Hunt - Blood and Wine');
  });

  it('deduplica filas duplicadas del wiki y auto-elige la exacta', async () => {
    vi.mocked(fetchExt).mockResolvedValue(cargo(['NieR: Automata', 'NieR: Automata']));
    const r = await agwLookupDetailed('NieR:Automata™');
    expect(r.result?.page).toBe('NieR: Automata');
  });
});
