// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Tests for the AreWeAntiCheatYet index against a real games.json excerpt
// (fixture with Elden Ring + one entry per status in the dataset).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIndex, infoAt } from '../src/lib/awacy';
import { stubChrome } from './chrome-mock';
import { must } from './helpers';

const games: unknown = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'awacy_sample.json'), 'utf8'),
);
const index = buildIndex(Array.isArray(games) ? games : []);

describe('buildIndex (AWACY)', () => {
  it('indexa por appid de Steam', () => {
    const elden = must(infoAt(index, index.bySteamId['1245620']), 'Elden Ring entry');
    expect(elden.name).toBe('Elden Ring');
    expect(elden.status).toBe('Supported');
    expect(elden.anticheats).toContain('Easy Anti-Cheat');
  });

  it('indexa por nombre normalizado (fallback sin appid)', () => {
    expect(infoAt(index, index.byName['elden ring'])).not.toBeNull();
    expect(must(infoAt(index, index.byName['elden ring'])).status).toBe('Supported');
  });

  it('cubre todos los statuses del dataset real', () => {
    const statuses = new Set(index.games.map((g) => g.status));
    for (const s of ['Supported', 'Running', 'Planned', 'Broken', 'Denied']) {
      expect(statuses.has(s as never), `falta status ${s}`).toBe(true);
    }
  });

  it('ignora entradas sin nombre o sin status', () => {
    const idx = buildIndex([{ name: 'X' }, { status: 'Denied' }, {}]);
    expect(Object.keys(idx.byName)).toHaveLength(0);
    expect(Object.keys(idx.bySteamId)).toHaveLength(0);
  });

  it('extrae la nota sin referencia (ref null)', () => {
    const elden = must(infoAt(index, index.bySteamId['1245620']), 'Elden Ring entry');
    expect(elden.notes).toEqual([
      {
        text: 'Game may not work out of the box unless you have purchased the DLC, Shadow of the Erdtree.',
        ref: null,
      },
    ]);
  });

  it('extrae varias notas con su referencia', () => {
    const halo = must(infoAt(index, index.bySteamId['976730']), 'Halo MCC entry');
    const notes = must(halo.notes, 'Halo notes');
    expect(notes).toHaveLength(2);
    expect(must(notes[0]).ref).toBe(
      'https://www.gamingonlinux.com/2023/04/halo-the-master-chief-collection-gets-steam-deck-support/',
    );
    expect(must(notes[1]).ref).toBe('https://www.protondb.com/app/976730#s1M6yjsTt');
  });

  it('normaliza una referencia vacía a null', () => {
    const paladins = must(infoAt(index, index.bySteamId['444090']), 'Paladins entry');
    expect(must(must(paladins.notes, 'Paladins notes')[0]).ref).toBeNull();
  });

  it('omite el campo notes cuando el juego no tiene ninguna', () => {
    const bf = must(infoAt(index, index.bySteamId['1517290']), 'Battlefield entry');
    expect(bf.notes).toBeUndefined();
  });

  it('descarta una referencia no http(s) (evita javascript:/data:)', () => {
    const idx = buildIndex([
      {
        name: 'Evil',
        status: 'Denied',
        storeIds: { steam: '999' },
        notes: [['click me', 'javascript:alert(1)']],
      },
    ]);
    const evil = must(infoAt(idx, idx.bySteamId['999']), 'Evil entry');
    expect(evil.notes).toEqual([{ text: 'click me', ref: null }]);
  });

  it('indexa por nombre base para variantes de edición de la tienda', () => {
    const idx = buildIndex([
      {
        name: 'Grand Theft Auto V',
        status: 'Denied',
        anticheats: ['BattlEye'],
        storeIds: { steam: '271590' },
      },
    ]);
    // "Grand Theft Auto V Enhanced" has no appid entry and misses byName;
    // the edition-stripped base key must still reach the warning.
    expect(infoAt(idx, idx.byName['grand theft auto v enhanced'])).toBeNull();
    expect(must(infoAt(idx, idx.byBaseName['grand theft auto v'])).status).toBe('Denied');
  });

  it('guarda cada entrada una sola vez, no una por clave', () => {
    // El índice se lee entero desde storage en cada contexto, y JSON no tiene
    // referencias compartidas: con entradas embebidas, un juego alcanzable por
    // appid, por nombre y por nombre base se serializaba tres veces.
    const idx = buildIndex([
      {
        name: 'Elden Ring',
        status: 'Denied',
        anticheats: ['Easy Anti-Cheat'],
        storeIds: { steam: '1245620' },
      },
    ]);
    expect(idx.games).toHaveLength(1);
    // Las tres claves apuntan a la misma posición.
    expect(idx.bySteamId['1245620']).toBe(0);
    expect(idx.byName['elden ring']).toBe(0);
    expect(idx.byBaseName['elden ring']).toBe(0);
    // Y el nombre aparece una sola vez en el JSON almacenado.
    expect(JSON.stringify(idx).split('Easy Anti-Cheat')).toHaveLength(2);
  });

  it('resuelve la entrada en la posición 0 (que es falsy)', () => {
    // El lookup anterior comprobaba `if (index.bySteamId[appid])`, cierto para
    // un objeto y falso para la posición 0: el primer juego del dataset.
    const idx = buildIndex([
      { name: 'First Game', status: 'Denied', storeIds: { steam: '111' } },
      { name: 'Second Game', status: 'Supported', storeIds: { steam: '222' } },
    ]);
    expect(idx.bySteamId['111']).toBe(0);
    expect(must(infoAt(idx, idx.bySteamId['111'])).name).toBe('First Game');
  });

  it('marca el esquema, para que un índice viejo se descarte', () => {
    expect(buildIndex([]).v).toBe(2);
  });

  it('con base compartida gana la entrada sin sufijo, en cualquier orden', () => {
    for (const games of [
      [
        { name: 'X Enhanced', status: 'Denied' },
        { name: 'X', status: 'Supported' },
      ],
      [
        { name: 'X', status: 'Supported' },
        { name: 'X Enhanced', status: 'Denied' },
      ],
    ]) {
      const idx = buildIndex(games);
      expect(must(infoAt(idx, idx.byBaseName['x'])).status).toBe('Supported');
    }
  });
});

describe('getIndex single-flight', () => {
  beforeEach(() => {
    vi.resetModules(); // fresh module: indexFetch/cache L1 are module state
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lookups concurrentes en frío comparten una descarga y un parse', async () => {
    const mock = stubChrome();
    let fetches = 0;
    mock.onSendMessage(() => {
      fetches++;
      return { ok: true, body: JSON.stringify(games), finalUrl: '' };
    });
    const awacy = await import('../src/lib/awacy');
    const [a, b] = await Promise.all([
      awacy.anticheatLookup('1245620', 'Elden Ring'),
      awacy.anticheatLookup('976730', 'Halo: The Master Chief Collection'),
    ]);
    expect(must(a).name).toBe('Elden Ring');
    expect(must(b).status).toBeDefined();
    expect(fetches).toBe(1);
    // A later caller reads the cached index without a new download.
    expect(await awacy.anticheatLookup('1245620', 'Elden Ring')).not.toBeNull();
    expect(fetches).toBe(1);
  });

  it('el fallo compartido resuelve null para todos sin dejar el vuelo colgado', async () => {
    const mock = stubChrome();
    let fetches = 0;
    mock.onSendMessage(() => {
      fetches++;
      return { ok: false, error: 'down', code: 'network' };
    });
    const awacy = await import('../src/lib/awacy');
    const [a, b] = await Promise.all([
      awacy.anticheatLookup('1', 'X'),
      awacy.anticheatLookup('2', 'Y'),
    ]);
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(fetches).toBe(1);
    // The shared failure left a cached negative, not a stuck promise.
    expect(await awacy.anticheatLookup('3', 'Z')).toBeNull();
    expect(fetches).toBe(1);
  });
});
