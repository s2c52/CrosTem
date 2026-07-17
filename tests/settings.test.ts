// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { DEFAULTS, mergeSettings } from '../src/lib/settings';

describe('mergeSettings', () => {
  it('sin nada guardado devuelve los defaults', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULTS);
    expect(mergeSettings(null)).toEqual(DEFAULTS);
    expect(mergeSettings({})).toEqual(DEFAULTS);
  });

  it('conserva lo guardado y completa campos que falten (migración)', () => {
    const merged = mergeSettings({ surfaces: { capsules: false } });
    expect(merged.surfaces.capsules).toBe(false);
    expect(merged.surfaces.app).toBe(true);
    expect(merged.sources).toEqual(DEFAULTS.sources);
  });

  it('sanea la versión de CrossOver', () => {
    expect(mergeSettings({ crossoverVersion: '  25  ' }).crossoverVersion).toBe('25');
    expect(mergeSettings({ crossoverVersion: '' }).crossoverVersion).toBe(
      DEFAULTS.crossoverVersion,
    );
    expect(mergeSettings({ crossoverVersion: 42 }).crossoverVersion).toBe(
      DEFAULTS.crossoverVersion,
    );
  });

  it('valida el idioma de la UI', () => {
    expect(mergeSettings({}).language).toBe('auto');
    expect(mergeSettings({ language: 'auto' }).language).toBe('auto');
    expect(mergeSettings({ language: 'ja' }).language).toBe('ja');
    expect(mergeSettings({ language: 'ES' }).language).toBe('es');
    expect(mergeSettings({ language: 'pt' }).language).toBe('pt-PT');
    expect(mergeSettings({ language: 'xx' }).language).toBe('auto');
    expect(mergeSettings({ language: 42 }).language).toBe('auto');
  });

  it('acota el TTL a 1-30 días y redondea', () => {
    expect(mergeSettings({ cacheTtlDays: 3.7 }).cacheTtlDays).toBe(4);
    expect(mergeSettings({ cacheTtlDays: 0 }).cacheTtlDays).toBe(DEFAULTS.cacheTtlDays);
    expect(mergeSettings({ cacheTtlDays: 99 }).cacheTtlDays).toBe(30);
    expect(mergeSettings({ cacheTtlDays: '7' }).cacheTtlDays).toBe(DEFAULTS.cacheTtlDays);
  });
});
