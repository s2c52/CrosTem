// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Parser tests against real CodeWeavers HTML (fixtures captured
// 2026-07-16). If CodeWeavers redesigns their site, recapture the fixtures:
//   curl -A "Mozilla/5.0" "https://www.codeweavers.com/compatibility?name=elden" > tests/fixtures/cw_name.html
//   curl -A "Mozilla/5.0" "https://www.codeweavers.com/compatibility/crossover/elden-ring" > tests/fixtures/cw_elden.html
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAppPage, parseSearchResults } from '../src/lib/parser';
import { must } from './helpers';

// <link> tags are stripped because happy-dom tries to download them (network
// noise in the tests) and they contribute nothing to the parsing.
const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8').replace(/<link[^>]*>/g, '');

describe('parseSearchResults', () => {
  it('extrae las filas de la búsqueda "elden"', () => {
    const results = parseSearchResults(fixture('cw_name.html'));
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      name: 'Elden Ring',
      slug: 'elden-ring',
      company: 'FromSoftware Inc.',
      stars: 5,
    });
    expect(results[1]).toMatchObject({
      name: 'ELDEN RING NIGHTREIGN',
      slug: 'elden-ring-nightreign',
      stars: 4,
    });
  });

  it('decodifica entidades HTML en los nombres (búsqueda "baldur")', () => {
    const results = parseSearchResults(fixture('cw_baldur.html'));
    const names = results.map((r) => r.name);
    expect(names).toContain("Baldur's Gate 3");
    expect(names).toContain("Baldur's Gate II: Shadows of Amn");
    expect(results.length).toBe(7);
  });

  it('devuelve [] con HTML sin tabla de resultados', () => {
    expect(parseSearchResults('<html><body><p>nada</p></body></html>')).toEqual([]);
  });
});

describe('parseAppPage', () => {
  const app = must(parseAppPage(fixture('cw_elden.html')), 'parsed app page');

  it('extrae el rating Mac con estado, última versión testeada y nº de reports', () => {
    expect(app.mac).toEqual({
      stars: 5,
      status: 'Runs Great',
      lastTested: '26.2.0',
      reportCount: 10,
    });
  });

  it('extrae el rating Linux por separado (heading con la misma clase CSS)', () => {
    expect(app.linux).toMatchObject({
      stars: 2,
      status: 'Installs, Will Not Run',
      lastTested: '24.0.1',
    });
  });

  it('extrae el slug y el rating agregado del JSON-LD', () => {
    expect(app.slug).toBe('elden-ring');
    expect(app.aggregate).toEqual({ value: 3.5, count: 2 });
  });

  it('extrae el desglose por versión, la más reciente primero, con plataforma', () => {
    const macVersions = app.versions.filter((v) => v.platform === 'macOS');
    expect(macVersions.slice(0, 3)).toEqual([
      { version: '26.2.0', platform: 'macOS', stars: 5 },
      { version: '26.1.0', platform: 'macOS', stars: 5 },
      { version: '26.0.0', platform: 'macOS', stars: 5 },
    ]);
    expect(app.versions.some((v) => v.platform === 'Linux')).toBe(true);
  });

  it('devuelve null si el HTML no es una ficha', () => {
    expect(parseAppPage('<html><body></body></html>')).toBeNull();
  });
});
