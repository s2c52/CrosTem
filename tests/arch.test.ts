// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Native Mac binary architecture detection: AGW mapping, inference
// from Steam requirements and year heuristic, plus their precedence.
import { describe, expect, it } from 'vitest';
import { archFromAgw, archFromReleaseYear, archFromSteamReqs, detectArch } from '../src/lib/arch';
import type { AgwCompat, AgwStatus } from '../src/types';

function agw(native: AgwStatus, rosetta2: AgwStatus): AgwCompat {
  return { page: 'X', crossover: 'unknown', parallels: 'unknown', native, rosetta2 };
}

describe('archFromAgw', () => {
  it('native positivo → M Series exacto', () => {
    expect(archFromAgw(agw('perfect', 'na'))).toEqual({ arch: 'm-series', approximate: false, source: 'agw' });
    expect(archFromAgw(agw('menu', 'unknown'))).toEqual({ arch: 'm-series', approximate: false, source: 'agw' });
  });

  it('native negativo + rosetta2 positivo → Intel exacto', () => {
    expect(archFromAgw(agw('na', 'playable'))).toEqual({ arch: 'intel', approximate: false, source: 'agw' });
  });

  it('native unknown + rosetta2 positivo → Intel aproximado', () => {
    expect(archFromAgw(agw('unknown', 'runs'))).toEqual({ arch: 'intel', approximate: true, source: 'agw' });
  });

  it('sin señal positiva → null', () => {
    expect(archFromAgw(agw("doesn't work", 'na'))).toBeNull();
    expect(archFromAgw(agw('unknown', 'unknown'))).toBeNull();
    expect(archFromAgw(null)).toBeNull();
  });
});

describe('archFromSteamReqs', () => {
  it('menciona Apple Silicon / M1 / arm64 → M Series~', () => {
    for (const reqs of [
      'Requires an Apple Silicon Mac',
      'Processor: M1 or later',
      'CPU: arm64',
      'Intel or Apple Silicon', // universal counts as M Series
    ]) {
      expect(archFromSteamReqs(reqs)).toEqual({ arch: 'm-series', approximate: true, source: 'steam-reqs' });
    }
  });

  it('menciona Intel/x86 → Intel~', () => {
    expect(archFromSteamReqs('Processor: Intel Core i5')).toEqual({ arch: 'intel', approximate: true, source: 'steam-reqs' });
  });

  it('Rosetta gana aunque cite M1', () => {
    expect(archFromSteamReqs('Runs via Rosetta 2 on M1 Macs')).toEqual({ arch: 'intel', approximate: true, source: 'steam-reqs' });
  });

  it('sin señal o vacío → null', () => {
    expect(archFromSteamReqs('Minimum: macOS 12, 8 GB RAM')).toBeNull();
    expect(archFromSteamReqs('')).toBeNull();
    expect(archFromSteamReqs(null)).toBeNull();
    expect(archFromSteamReqs(undefined)).toBeNull();
  });

  it('no confunde palabras que contienen m1 (Rem1x) fuera de límite de palabra', () => {
    expect(archFromSteamReqs('Soundtrack Rem1x edition')).toBeNull();
  });
});

describe('archFromReleaseYear', () => {
  it('≥2021 → M Series~, <2021 → Intel~', () => {
    expect(archFromReleaseYear(2021)).toEqual({ arch: 'm-series', approximate: true, source: 'date' });
    expect(archFromReleaseYear(2026)).toEqual({ arch: 'm-series', approximate: true, source: 'date' });
    expect(archFromReleaseYear(2020)).toEqual({ arch: 'intel', approximate: true, source: 'date' });
    expect(archFromReleaseYear(1998)).toEqual({ arch: 'intel', approximate: true, source: 'date' });
  });

  it('sin año → null', () => {
    expect(archFromReleaseYear(null)).toBeNull();
    expect(archFromReleaseYear(undefined)).toBeNull();
  });
});

describe('detectArch (precedencia AGW → reqs → fecha)', () => {
  const steam = { name: 'X', mac: true, macRequirements: 'Apple Silicon only', releaseYear: 2019 };

  it('AGW gana a los requisitos de Steam', () => {
    expect(detectArch(agw('na', 'perfect'), steam))
      .toEqual({ arch: 'intel', approximate: false, source: 'agw' });
  });

  it('sin AGW, requisitos ganan a la fecha', () => {
    expect(detectArch(null, steam))
      .toEqual({ arch: 'm-series', approximate: true, source: 'steam-reqs' });
  });

  it('solo fecha como último recurso', () => {
    expect(detectArch(null, { name: 'X', mac: true, macRequirements: null, releaseYear: 2019 }))
      .toEqual({ arch: 'intel', approximate: true, source: 'date' });
  });

  it('shape viejo de caché (sin campos nuevos) no rompe', () => {
    expect(detectArch(null, { name: 'X', mac: true })).toBeNull();
    expect(detectArch(null, null)).toBeNull();
  });
});
