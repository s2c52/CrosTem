// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Combined verdict engine (traffic light). Pure, tested function: takes
// the signals from the three sources and produces level + label + reasons.
//
// CONSERVATIVE policy (product decision, see ROADMAP.md):
// - 🟢 only if CodeWeavers ≥ "Runs Well" or AGW ≥ playable, with no bad signal
//   from the other source and no blocked anticheat.
// - Anticheat Denied/Broken (Linux/Proton data, indicative) lowers to 🔴.
// - Mixed or intermediate signals → 🟡. No data → ⚪ unknown.
import type { AgwCompat, AnticheatInfo, CwSignal, Verdict, VerdictLevel } from '../types';

function cwGood(cw: CwSignal | null): boolean {
  if (!cw) return false;
  const s = (cw.status ?? '').toLowerCase();
  if (s.includes('great') || s.includes('well')) return true;
  return cw.stars != null && cw.stars >= 4;
}

function cwBad(cw: CwSignal | null): boolean {
  if (!cw) return false;
  const s = (cw.status ?? '').toLowerCase();
  if (s.includes('will not') || s.includes('not work') || s.includes("won't")) return true;
  return cw.stars != null && cw.stars <= 1 && !cwGood(cw);
}

function agwGood(agw: AgwCompat | null): boolean {
  return agw != null && (agw.crossover === 'perfect' || agw.crossover === 'playable');
}

function agwBad(agw: AgwCompat | null): boolean {
  return agw != null && (agw.crossover === 'unplayable' || agw.crossover === "doesn't work" || agw.crossover === 'menu');
}

function acBlocked(ac: AnticheatInfo | null): boolean {
  return ac != null && (ac.status === 'Denied' || ac.status === 'Broken');
}

function acUncertain(ac: AnticheatInfo | null): boolean {
  return ac != null && ac.status === 'Planned';
}

const LABELS: Record<VerdictLevel, string> = {
  green: 'Playable on Mac via CrossOver',
  yellow: 'Playable with caveats',
  red: 'Likely unplayable on Mac',
  unknown: 'No compatibility data',
};

export function computeVerdict(
  cw: CwSignal | null,
  agw: AgwCompat | null,
  ac: AnticheatInfo | null,
): Verdict {
  const reasons: string[] = [];
  const hasCw = cw != null && (cw.stars != null || !!cw.status);
  const hasAgwSignal = agw != null && agw.crossover !== 'na' && agw.crossover !== 'unknown';

  if (cw?.status) reasons.push(`CodeWeavers: ${cw.status}`);
  else if (cw?.stars != null) reasons.push(`CodeWeavers: ${cw.stars}/5 stars`);
  if (hasAgwSignal) reasons.push(`AppleGamingWiki: CrossOver ${agw.crossover}`);
  if (ac) {
    reasons.push(`Anticheat (${ac.anticheats.join(', ') || 'unknown'}): ${ac.status} on Linux/Proton — indicative for CrossOver`);
  }

  let level: VerdictLevel;
  if (!hasCw && !hasAgwSignal) {
    // No compatibility data: anticheat alone does not assert playability,
    // but a block does deny it.
    level = acBlocked(ac) ? 'red' : 'unknown';
  } else if (acBlocked(ac)) {
    level = 'red';
  } else {
    const good = cwGood(cw) || agwGood(agw);
    const bad = cwBad(cw) || agwBad(agw);
    if (good && !bad && !acUncertain(ac)) level = 'green';
    else if (!good && bad) level = 'red';
    else level = 'yellow'; // mixed, intermediate or uncertain anticheat
  }

  if (level === 'yellow' && (cwGood(cw) || agwGood(agw)) && (cwBad(cw) || agwBad(agw))) {
    reasons.push('Sources disagree — check both before buying');
  }

  return { level, label: LABELS[level], reasons };
}
