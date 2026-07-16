// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Tests for parsing the AppleGamingWiki cargoquery API against a real
// captured response (fixture captured 2026-07-16).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agwPageUrl, parseCargoResponse } from '../src/lib/agw';
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
