// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Combined verdict engine (traffic light). Pure, tested function: takes
// the signals from the three sources and produces the level; the UI
// renders it via the localized verdict_* keys.
//
// CONSERVATIVE policy (product decision, see ROADMAP.md):
// - 🟢 only if CodeWeavers ≥ "Runs Well" or AGW ≥ playable, with no bad signal
//   from the other source and no blocked anticheat.
// - Anticheat Denied/Broken (Linux/Proton data, indicative) lowers to 🔴.
// - Mixed or intermediate signals → 🟡. No data → ⚪ unknown.
import { CW_STARS_BAD, CW_STARS_GOOD } from './constants';
import type { AgwCompat, AnticheatInfo, CwSignal, VerdictLevel } from '../types';

function cwGood(cw: CwSignal | null): boolean {
  if (!cw) return false;
  const s = (cw.status ?? '').toLowerCase();
  if (s.includes('great') || s.includes('well')) return true;
  return cw.stars != null && cw.stars >= CW_STARS_GOOD;
}

function cwBad(cw: CwSignal | null): boolean {
  if (!cw) return false;
  const s = (cw.status ?? '').toLowerCase();
  if (s.includes('will not') || s.includes('not work') || s.includes("won't")) return true;
  return cw.stars != null && cw.stars <= CW_STARS_BAD && !cwGood(cw);
}

function agwGood(agw: AgwCompat | null): boolean {
  return agw != null && (agw.crossover === 'perfect' || agw.crossover === 'playable');
}

function agwBad(agw: AgwCompat | null): boolean {
  return (
    agw != null &&
    (agw.crossover === 'unplayable' || agw.crossover === "doesn't work" || agw.crossover === 'menu')
  );
}

function acBlocked(ac: AnticheatInfo | null): boolean {
  return ac != null && (ac.status === 'Denied' || ac.status === 'Broken');
}

function acUncertain(ac: AnticheatInfo | null): boolean {
  return ac != null && ac.status === 'Planned';
}

export function computeVerdict(
  cw: CwSignal | null,
  agw: AgwCompat | null,
  ac: AnticheatInfo | null,
): VerdictLevel {
  const hasCw = cw != null && (cw.stars != null || !!cw.status);
  const hasAgwSignal = agw != null && agw.crossover !== 'na' && agw.crossover !== 'unknown';

  if (!hasCw && !hasAgwSignal) {
    // No compatibility data: anticheat alone does not assert playability,
    // but a block does deny it.
    return acBlocked(ac) ? 'red' : 'unknown';
  }
  if (acBlocked(ac)) return 'red';
  const good = cwGood(cw) || agwGood(agw);
  const bad = cwBad(cw) || agwBad(agw);
  if (good && !bad && !acUncertain(ac)) return 'green';
  if (!good && bad) return 'red';
  return 'yellow'; // mixed, intermediate or uncertain anticheat
}
