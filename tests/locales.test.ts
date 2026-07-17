// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Locale parity gate: every dictionary ships the same keys and placeholders
// as English, and every _locales folder carries exactly the manifest pair.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '../src/lib/steam-lang';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(ROOT, 'public', 'locales');
const CHROME_LOCALES_DIR = join(ROOT, 'public', '_locales');

interface RawMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

function readLocale(dir: string, file: string): Record<string, RawMessage> {
  return JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, RawMessage>;
}

const en = readLocale(LOCALES_DIR, 'en.json');
const namedTokens = (msg: string): string[] => (msg.match(/\$[A-Z_]+\$/g) ?? []).sort();

describe('paridad de locales (public/locales)', () => {
  it('hay exactamente un diccionario por locale soportado', () => {
    const files = readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect(files).toEqual([...SUPPORTED_LOCALES].sort());
  });

  for (const code of SUPPORTED_LOCALES) {
    it(`${code}: mismas claves, mensajes no vacíos y placeholders que en`, () => {
      const dict = readLocale(LOCALES_DIR, `${code}.json`);
      expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
      for (const [key, entry] of Object.entries(dict)) {
        const ref = en[key];
        if (!ref) continue; // key-set mismatch already reported above
        expect(entry.message.trim(), `${code}/${key} vacío`).not.toBe('');
        expect(namedTokens(entry.message), `${code}/${key} tokens`).toEqual(
          namedTokens(ref.message),
        );
        expect(entry.placeholders ?? null, `${code}/${key} placeholders`).toEqual(
          ref.placeholders ?? null,
        );
      }
    });
  }
});

describe('paridad de _locales (manifest)', () => {
  it('hay una carpeta por locale soportado (BCP-47 con guión bajo)', () => {
    const dirs = readdirSync(CHROME_LOCALES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(dirs).toEqual(SUPPORTED_LOCALES.map((c) => c.replace(/-/g, '_')).sort());
  });

  for (const code of SUPPORTED_LOCALES) {
    const dir = code.replace(/-/g, '_');
    it(`${dir}: exactamente appName y appDesc, no vacíos`, () => {
      const msgs = readLocale(join(CHROME_LOCALES_DIR, dir), 'messages.json');
      expect(Object.keys(msgs).sort()).toEqual(['appDesc', 'appName']);
      expect(msgs.appName?.message.trim()).toBeTruthy();
      expect(msgs.appDesc?.message.trim()).toBeTruthy();
      expect(msgs.appName?.message).toContain('CrosTem');
    });
  }
});
