// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest';
import {
  LOCALE_NATIVE_NAMES,
  STEAM_TO_BCP47,
  SUPPORTED_LOCALES,
  detectPageLocale,
  detectSteamLanguage,
  normalizeToSupported,
} from '../src/lib/steam-lang';

function makeDoc(html: string, cookie = ''): Document {
  const doc = document.implementation.createHTMLDocument('');
  // type="text/plain" stops happy-dom from actually fetching fixture scripts.
  doc.body.innerHTML = html.replaceAll('<script ', '<script type="text/plain" ');
  if (cookie) {
    Object.defineProperty(doc, 'cookie', { value: cookie, configurable: true });
  }
  return doc;
}

function appConfig(language: string): string {
  const json = JSON.stringify({ LANGUAGE: language, COUNTRY: 'US' });
  return `<div id="application_config" data-config='${json}'></div>`;
}

beforeEach(() => {
  document.documentElement.lang = '';
});

describe('normalizeToSupported', () => {
  it('acepta locales exactos sin importar mayúsculas (community usa "zh-cn")', () => {
    expect(normalizeToSupported('zh-cn')).toBe('zh-CN');
    expect(normalizeToSupported('ZH-TW')).toBe('zh-TW');
    expect(normalizeToSupported('es-419')).toBe('es-419');
    expect(normalizeToSupported('pt-BR')).toBe('pt-BR');
  });

  it('cae al idioma base cuando la región no está soportada', () => {
    expect(normalizeToSupported('fr-CA')).toBe('fr');
    expect(normalizeToSupported('de-AT')).toBe('de');
    expect(normalizeToSupported('en-GB')).toBe('en');
  });

  it('resuelve bases sin locale propio: pt→pt-PT, zh→zh-CN, no→nb', () => {
    expect(normalizeToSupported('pt')).toBe('pt-PT');
    expect(normalizeToSupported('zh')).toBe('zh-CN');
    expect(normalizeToSupported('no')).toBe('nb');
    expect(normalizeToSupported('nn-NO')).toBe('nb');
  });

  it('devuelve null para desconocidos o vacíos', () => {
    expect(normalizeToSupported('ar')).toBeNull();
    expect(normalizeToSupported('he-IL')).toBeNull();
    expect(normalizeToSupported('')).toBeNull();
    expect(normalizeToSupported(null)).toBeNull();
  });
});

describe('detectSteamLanguage', () => {
  it('application_config gana al resto de señales', () => {
    const doc = makeDoc(
      appConfig('koreana') + '<script src="https://store.example/x.js?l=french"></script>',
      'Steam_Language=german',
    );
    expect(detectSteamLanguage(doc)).toBe('koreana');
  });

  it('sin config usa ?l= de los script src', () => {
    const doc = makeDoc(
      '<script src="https://store.example/x.js?v=1&l=latam"></script>',
      'Steam_Language=german',
    );
    expect(detectSteamLanguage(doc)).toBe('latam');
  });

  it('sin config ni scripts usa la cookie Steam_Language', () => {
    const doc = makeDoc('<p>hi</p>', 'sessionid=abc; Steam_Language=schinese');
    expect(detectSteamLanguage(doc)).toBe('schinese');
  });

  it('ignora códigos que no son idiomas de Steam (config corrupto, l= raro)', () => {
    const doc = makeDoc(
      '<div id="application_config" data-config="{not json"></div>' +
        '<script src="https://store.example/x.js?l=klingon"></script>',
      'Steam_Language=arabic',
    );
    expect(detectSteamLanguage(doc)).toBeNull();
  });

  it('devuelve null en una página sin señales', () => {
    expect(detectSteamLanguage(makeDoc('<p>hi</p>'))).toBeNull();
  });
});

describe('detectPageLocale', () => {
  it('mapea el código Steam a BCP-47', () => {
    expect(detectPageLocale(makeDoc(appConfig('brazilian')))).toBe('pt-BR');
    expect(detectPageLocale(makeDoc(appConfig('tchinese')))).toBe('zh-TW');
  });

  it('cae a html[lang] normalizado cuando no hay señales Steam', () => {
    const doc = makeDoc('<p>hi</p>');
    doc.documentElement.lang = 'zh-cn';
    expect(detectPageLocale(doc)).toBe('zh-CN');
  });

  it('por defecto devuelve en', () => {
    expect(detectPageLocale(makeDoc('<p>hi</p>'))).toBe('en');
  });
});

describe('STEAM_TO_BCP47', () => {
  it('cubre los 30 idiomas de la UI de Steam y todos los valores son locales soportados', () => {
    expect(Object.keys(STEAM_TO_BCP47)).toHaveLength(30);
    expect(SUPPORTED_LOCALES).toHaveLength(30);
    for (const code of Object.values(STEAM_TO_BCP47)) {
      expect(SUPPORTED_LOCALES).toContain(code);
    }
  });
});

describe('LOCALE_NATIVE_NAMES', () => {
  it('tiene un endónimo no vacío para cada locale soportado, y solo para esos', () => {
    expect(Object.keys(LOCALE_NATIVE_NAMES).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    for (const name of Object.values(LOCALE_NATIVE_NAMES)) {
      expect(name.trim()).not.toBe('');
    }
  });
});
