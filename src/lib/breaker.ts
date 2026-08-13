// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Per-origin circuit breaker: after BREAKER_FAILURES consecutive final
// failures (one whole fetchWithPolicy run = one failure, however many
// retries it made) the origin is rejected fast for BREAKER_COOLDOWN_MS,
// so a downed API stops holding queue slots hostage. In-memory only —
// MV3 may kill the worker and reset the state, which just means the
// breaker re-learns; that trade-off is deliberate ("simple breaker").
// No half-open probe: after the cooldown the counter restarts from zero,
// so a still-down origin takes another full round of failures to re-open.
// Acceptable at MAX_CONCURRENT_FETCHES = 4.
import { BREAKER_COOLDOWN_MS, BREAKER_FAILURES } from './constants';

export interface Breaker {
  /** False while the origin's cooldown is running. */
  allow(origin: string): boolean;
  /** Resets the origin's failure count. */
  onSuccess(origin: string): void;
  /** Counts one final failure; opens the breaker at the threshold. */
  onFailure(origin: string): void;
}

interface OriginState {
  failures: number;
  openedAt: number | null;
}

export function createBreaker(
  threshold: number = BREAKER_FAILURES,
  cooldownMs: number = BREAKER_COOLDOWN_MS,
  now: () => number = Date.now,
): Breaker {
  const state = new Map<string, OriginState>();

  return {
    allow(origin) {
      const s = state.get(origin);
      if (!s || s.openedAt === null) return true;
      if (now() - s.openedAt < cooldownMs) return false;
      state.delete(origin);
      return true;
    },
    onSuccess(origin) {
      state.delete(origin);
    },
    onFailure(origin) {
      const s = state.get(origin) ?? { failures: 0, openedAt: null };
      s.failures++;
      if (s.failures >= threshold && s.openedAt === null) s.openedAt = now();
      state.set(origin, s);
    },
  };
}
