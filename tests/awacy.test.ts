// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Tests for the AreWeAntiCheatYet index against a real games.json excerpt
// (fixture with Elden Ring + one entry per status in the dataset).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex } from '../src/lib/awacy';
import { must } from './helpers';

const games: unknown = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'awacy_sample.json'), 'utf8'),
);
const index = buildIndex(Array.isArray(games) ? games : []);

describe('buildIndex (AWACY)', () => {
  it('indexa por appid de Steam', () => {
    const elden = must(index.bySteamId['1245620'], 'Elden Ring entry');
    expect(elden.name).toBe('Elden Ring');
    expect(elden.status).toBe('Supported');
    expect(elden.anticheats).toContain('Easy Anti-Cheat');
  });

  it('indexa por nombre normalizado (fallback sin appid)', () => {
    expect(index.byName['elden ring']).toBeDefined();
    expect(must(index.byName['elden ring']).status).toBe('Supported');
  });

  it('cubre todos los statuses del dataset real', () => {
    const statuses = new Set(Object.values(index.byName).map((g) => g.status));
    for (const s of ['Supported', 'Running', 'Planned', 'Broken', 'Denied']) {
      expect(statuses.has(s as never), `falta status ${s}`).toBe(true);
    }
  });

  it('ignora entradas sin nombre o sin status', () => {
    const idx = buildIndex([{ name: 'X' }, { status: 'Denied' }, {}]);
    expect(Object.keys(idx.byName)).toHaveLength(0);
    expect(Object.keys(idx.bySteamId)).toHaveLength(0);
  });
});
