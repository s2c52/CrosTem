// Motor de veredicto combinado (semáforo). Función pura y testeada: recibe
// las señales de las tres fuentes y produce nivel + etiqueta + razones.
//
// Política CONSERVADORA (decisión de producto, ver ROADMAP.md):
// - 🟢 solo si CodeWeavers ≥ "Runs Well" o AGW ≥ playable, sin señal mala de
//   la otra fuente y sin anticheat bloqueado.
// - Anticheat Denied/Broken (dato de Linux/Proton, orientativo) baja a 🔴.
// - Señales mixtas o intermedias → 🟡. Sin datos → ⚪ unknown.
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
    // Sin datos de compatibilidad: el anticheat solo no afirma jugabilidad,
    // pero un bloqueo sí la niega.
    level = acBlocked(ac) ? 'red' : 'unknown';
  } else if (acBlocked(ac)) {
    level = 'red';
  } else {
    const good = cwGood(cw) || agwGood(agw);
    const bad = cwBad(cw) || agwBad(agw);
    if (good && !bad && !acUncertain(ac)) level = 'green';
    else if (!good && bad) level = 'red';
    else level = 'yellow'; // mixto, intermedio o anticheat incierto
  }

  if (level === 'yellow' && (cwGood(cw) || agwGood(agw)) && (cwBad(cw) || agwBad(agw))) {
    reasons.push('Sources disagree — check both before buying');
  }

  return { level, label: LABELS[level], reasons };
}
