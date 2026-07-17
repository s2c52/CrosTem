// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { computeVerdict } from '../src/lib/verdict';
import type { AgwCompat, AnticheatInfo, CwSignal } from '../src/types';

const agw = (crossover: AgwCompat['crossover']): AgwCompat => ({
  page: 'Test Game',
  crossover,
  parallels: 'na',
  native: 'na',
  rosetta2: 'na',
});

const ac = (status: AnticheatInfo['status']): AnticheatInfo => ({
  name: 'Test Game',
  status,
  anticheats: ['EAC'],
});

const cwGreat: CwSignal = { stars: 5, status: 'Runs Great' };
const cwBad: CwSignal = { stars: 2, status: 'Installs, Will Not Run' };

describe('computeVerdict (política conservadora)', () => {
  it('verde: CodeWeavers Runs Great sin contradicciones', () => {
    expect(computeVerdict(cwGreat, null, null).level).toBe('green');
  });

  it('verde: AGW playable aunque no haya datos de CodeWeavers', () => {
    expect(computeVerdict(null, agw('playable'), null).level).toBe('green');
  });

  it('verde: buenas señales y anticheat Supported', () => {
    expect(computeVerdict(cwGreat, agw('perfect'), ac('Supported')).level).toBe('green');
  });

  it('amarillo: fuentes en desacuerdo (CW bien, AGW unplayable)', () => {
    const v = computeVerdict(cwGreat, agw('unplayable'), null);
    expect(v.level).toBe('yellow');
    expect(v.reasons.some((r) => r.includes('disagree'))).toBe(true);
  });

  it('amarillo: señal intermedia (3 estrellas sin estado)', () => {
    expect(computeVerdict({ stars: 3 }, null, null).level).toBe('yellow');
  });

  it('amarillo: buena señal pero anticheat Planned (incierto)', () => {
    expect(computeVerdict(cwGreat, null, ac('Planned')).level).toBe('yellow');
  });

  it('rojo: anticheat Denied aplasta cualquier señal buena', () => {
    const v = computeVerdict(cwGreat, agw('perfect'), ac('Denied'));
    expect(v.level).toBe('red');
    expect(v.reasons.some((r) => r.includes('Denied'))).toBe(true);
  });

  it('rojo: anticheat Broken también bloquea', () => {
    expect(computeVerdict(cwGreat, null, ac('Broken')).level).toBe('red');
  });

  it('rojo: solo señales malas (CW will not run)', () => {
    expect(computeVerdict(cwBad, null, null).level).toBe('red');
  });

  it("rojo: AGW doesn't work sin señal buena", () => {
    expect(computeVerdict(null, agw("doesn't work"), null).level).toBe('red');
  });

  it('unknown: sin ningún dato', () => {
    expect(computeVerdict(null, null, null).level).toBe('unknown');
  });

  it('unknown: AGW na no cuenta como señal', () => {
    expect(computeVerdict(null, agw('na'), null).level).toBe('unknown');
  });

  it('rojo: sin datos de compatibilidad pero anticheat bloqueado', () => {
    expect(computeVerdict(null, null, ac('Denied')).level).toBe('red');
  });

  it('anticheat Running no penaliza señales buenas', () => {
    expect(computeVerdict(cwGreat, null, ac('Running')).level).toBe('green');
  });

  it('las razones citan cada fuente presente', () => {
    const v = computeVerdict(cwGreat, agw('playable'), ac('Supported'));
    expect(v.reasons.join(' ')).toContain('CodeWeavers');
    expect(v.reasons.join(' ')).toContain('AppleGamingWiki');
    expect(v.reasons.join(' ')).toContain('EAC');
  });
});
