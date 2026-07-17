// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { createBreaker } from '../src/lib/breaker';

const ORIGIN = 'https://www.codeweavers.com';

function makeBreaker(threshold = 5, cooldownMs = 120_000) {
  const clock = { now: 0 };
  const breaker = createBreaker(threshold, cooldownMs, () => clock.now);
  return { breaker, clock };
}

describe('createBreaker', () => {
  it('permite el tráfico por debajo del umbral de fallos', () => {
    const { breaker } = makeBreaker();
    expect(breaker.allow(ORIGIN)).toBe(true);
    for (let i = 0; i < 4; i++) breaker.onFailure(ORIGIN);
    expect(breaker.allow(ORIGIN)).toBe(true);
  });

  it('abre tras el quinto fallo consecutivo', () => {
    const { breaker } = makeBreaker();
    for (let i = 0; i < 5; i++) breaker.onFailure(ORIGIN);
    expect(breaker.allow(ORIGIN)).toBe(false);
  });

  it('un éxito resetea el contador', () => {
    const { breaker } = makeBreaker();
    for (let i = 0; i < 4; i++) breaker.onFailure(ORIGIN);
    breaker.onSuccess(ORIGIN);
    for (let i = 0; i < 4; i++) breaker.onFailure(ORIGIN);
    expect(breaker.allow(ORIGIN)).toBe(true);
  });

  it('se cierra al expirar el cooldown y reinicia el contador', () => {
    const { breaker, clock } = makeBreaker();
    for (let i = 0; i < 5; i++) breaker.onFailure(ORIGIN);
    clock.now = 119_999;
    expect(breaker.allow(ORIGIN)).toBe(false);
    clock.now = 120_000;
    expect(breaker.allow(ORIGIN)).toBe(true);
    // Counter restarted: it takes another full round to re-open.
    for (let i = 0; i < 4; i++) breaker.onFailure(ORIGIN);
    expect(breaker.allow(ORIGIN)).toBe(true);
  });

  it('mantiene estado independiente por origen', () => {
    const { breaker } = makeBreaker();
    for (let i = 0; i < 5; i++) breaker.onFailure(ORIGIN);
    expect(breaker.allow(ORIGIN)).toBe(false);
    expect(breaker.allow('https://www.applegamingwiki.com')).toBe(true);
  });
});
