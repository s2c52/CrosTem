// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { sanitizeChoiceImport } from '../src/lib/guards';

describe('sanitizeChoiceImport', () => {
  it('conserva solo entradas choice:* con valor string', () => {
    const out = sanitizeChoiceImport(
      {
        'choice:cw:10': 'elden-ring',
        'choice:agw:20': 'Hades',
        'uiLang': 'es', // clave que no es choice:
        'choice:cw:30': 42, // valor no string
        'cache:x': 'y',
      },
      100,
      200,
    );
    expect(out).toEqual({ 'choice:cw:10': 'elden-ring', 'choice:agw:20': 'Hades' });
  });

  it('descarta valores más largos que el máximo', () => {
    const out = sanitizeChoiceImport(
      { 'choice:cw:1': 'x'.repeat(201), 'choice:cw:2': 'ok' },
      100,
      200,
    );
    expect(out).toEqual({ 'choice:cw:2': 'ok' });
  });

  it('acota el número total de entradas al máximo', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 10; i++) many[`choice:cw:${i}`] = `slug${i}`;
    const out = sanitizeChoiceImport(many, 3, 200);
    expect(Object.keys(out)).toHaveLength(3);
  });

  it('devuelve {} para entradas que no son objeto', () => {
    expect(sanitizeChoiceImport(null, 100, 200)).toEqual({});
    expect(sanitizeChoiceImport('nope', 100, 200)).toEqual({});
    expect(sanitizeChoiceImport(['choice:cw:1', 'x'], 100, 200)).toEqual({});
  });
});
