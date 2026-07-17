// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyI18n, compileMessages, currentLocale, initI18n, t } from '../src/lib/i18n';

const DICTS: Record<string, unknown> = {
  'locales/en.json': {
    widgetTitle: { message: 'Runs on Mac?' },
    lastTested: { message: 'Last Tested: $VER$', placeholders: { VER: { content: '$1' } } },
    starsAria: {
      message: '$N$ of $MAX$ stars',
      placeholders: { N: { content: '$1' }, MAX: { content: '$2' } },
    },
  },
  'locales/es.json': {
    widgetTitle: { message: '¿Corre en Mac?' },
    lastTested: { message: 'Última prueba: $VER$', placeholders: { VER: { content: '$1' } } },
    starsAria: {
      message: '$N$ de $MAX$ estrellas',
      placeholders: { N: { content: '$1' }, MAX: { content: '$2' } },
    },
  },
};

function stubExtension(storage: Record<string, unknown> = {}) {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => path },
    storage: {
      local: {
        get: (key: string) => Promise.resolve({ [key]: storage[key] }),
        set: (items: Record<string, unknown>) => {
          Object.assign(storage, items);
          return Promise.resolve();
        },
      },
    },
  });
  vi.stubGlobal('fetch', (url: string) => {
    const body = DICTS[url];
    return Promise.resolve(
      body === undefined
        ? { ok: false, json: () => Promise.reject(new Error('404')) }
        : { ok: true, json: () => Promise.resolve(body) },
    );
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  // Leave the module dict-less so other test files keep the key-fallback contract.
  await initI18n('en').catch(() => undefined);
});

describe('compileMessages', () => {
  it('resuelve placeholders con nombre a posicionales', () => {
    const compiled = compileMessages({
      a: { message: 'Hola $NAME$ y $NAME$', placeholders: { NAME: { content: '$1' } } },
      b: { message: 'sin placeholders' },
    });
    expect(compiled.a).toBe('Hola $1 y $1');
    expect(compiled.b).toBe('sin placeholders');
  });
});

describe('initI18n + t', () => {
  it('carga el locale pedido y traduce', async () => {
    stubExtension();
    await initI18n('es');
    expect(currentLocale()).toBe('es');
    expect(t('widgetTitle')).toBe('¿Corre en Mac?');
  });

  it('sustituye posicionales: uno (string) y varios (array)', async () => {
    stubExtension();
    await initI18n('en');
    expect(t('lastTested', '26')).toBe('Last Tested: 26');
    expect(t('starsAria', ['3', '5'])).toBe('3 of 5 stars');
  });

  it('clave desconocida cae a la propia clave', async () => {
    stubExtension();
    await initI18n('en');
    expect(t('noSuchKey')).toBe('noSuchKey');
  });

  it('sin entorno de extensión t() devuelve la clave (contrato para tests)', async () => {
    await initI18n('es'); // fetch/chrome reales no existen aquí
    expect(t('widgetTitle')).toBe('widgetTitle');
  });

  it('locale sin diccionario cae a en', async () => {
    stubExtension();
    await initI18n('th');
    expect(currentLocale()).toBe('en');
    expect(t('widgetTitle')).toBe('Runs on Mac?');
  });

  it('sin argumento usa el uiLang persistido y luego navigator.language', async () => {
    stubExtension({ uiLang: 'es' });
    await initI18n();
    expect(currentLocale()).toBe('es');

    stubExtension();
    // happy-dom expone navigator.language = 'en-US' → normaliza a 'en'.
    await initI18n();
    expect(currentLocale()).toBe('en');
  });

  it('normaliza el idioma pedido (zh-cn de community)', async () => {
    stubExtension();
    await initI18n('zh-cn');
    // zh-CN no está en los stubs → cae a en, pero el intento fue normalizado.
    expect(currentLocale()).toBe('en');
  });
});

describe('applyI18n', () => {
  it('rellena los [data-i18n] y el título', async () => {
    stubExtension();
    await initI18n('es');
    document.body.innerHTML = '<span data-i18n="widgetTitle"></span>';
    applyI18n('widgetTitle');
    expect(document.querySelector('span')?.textContent).toBe('¿Corre en Mac?');
    expect(document.title).toBe('¿Corre en Mac?');
  });
});
