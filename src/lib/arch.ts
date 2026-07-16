// Detección de la arquitectura del binario nativo Mac (M Series vs Intel).
// Cadena de señales: AppleGamingWiki (native/rosetta2, explícito) →
// requisitos Mac de Steam (texto, inferido) → año de lanzamiento (heurística).
// Todo lo inferido va con approximate=true y se pinta con "~".
import { agwLookup } from './agw';
import { steamDetails } from './client';
import { getSettings } from './settings';
import type { AgwCompat, AgwStatus, ArchInfo, SteamDetails } from '../types';

// Estados AGW que implican que ese modo existe y arranca.
const POSITIVE: readonly AgwStatus[] = ['perfect', 'playable', 'runs', 'menu'];
const NEGATIVE: readonly AgwStatus[] = ['na', "doesn't work", 'unplayable'];

export function archFromAgw(agw: AgwCompat | null): ArchInfo | null {
  if (!agw) return null;
  if (POSITIVE.includes(agw.native)) {
    return { arch: 'm-series', approximate: false, source: 'agw' };
  }
  if (POSITIVE.includes(agw.rosetta2)) {
    // native negativo → binario Intel seguro; native unknown → probablemente
    // Intel-only, pero AGW podría simplemente no haber rellenado la celda.
    return { arch: 'intel', approximate: !NEGATIVE.includes(agw.native), source: 'agw' };
  }
  return null;
}

const ROSETTA_RE = /rosetta/i; // reqs que citan Rosetta ⇒ binario Intel
const M_RE = /apple\s+silicon|\bm[1-4](\s+(pro|max|ultra|chip))?\b|\barm64\b/i;
const INTEL_RE = /\bintel\b|\bx86\b|\bx64\b/i;

export function archFromSteamReqs(reqs: string | null | undefined): ArchInfo | null {
  if (!reqs) return null;
  // Rosetta primero (aunque citen "M1" es traducción); Apple Silicon antes que
  // Intel para que "Intel or Apple Silicon" (universal) cuente como M Series.
  if (ROSETTA_RE.test(reqs)) return { arch: 'intel', approximate: true, source: 'steam-reqs' };
  if (M_RE.test(reqs)) return { arch: 'm-series', approximate: true, source: 'steam-reqs' };
  if (INTEL_RE.test(reqs)) return { arch: 'intel', approximate: true, source: 'steam-reqs' };
  return null;
}

// Los Macs M salieron a finales de 2020: antes solo había binarios Intel.
export function archFromReleaseYear(year: number | null | undefined): ArchInfo | null {
  if (!year) return null;
  return { arch: year >= 2021 ? 'm-series' : 'intel', approximate: true, source: 'date' };
}

/** Cadena de señales pura: AGW → requisitos Steam → fecha. */
export function detectArch(agw: AgwCompat | null, steam: SteamDetails | null): ArchInfo | null {
  return archFromAgw(agw)
    ?? archFromSteamReqs(steam?.macRequirements)
    ?? archFromReleaseYear(steam?.releaseYear);
}

/**
 * Resuelve la arquitectura de un juego nativo consultando las fuentes
 * (con sus cachés). Solo pide appdetails si AGW no dio señal y no venía
 * precargado. Nunca lanza: sin dato → null.
 */
export async function resolveNativeArch(
  name: string | null,
  appid: string | null | undefined,
  preloaded?: SteamDetails | null,
): Promise<ArchInfo | null> {
  const settings = await getSettings();
  const agw = settings.sources.agw && name
    ? await agwLookup(name, appid).catch(() => null)
    : null;
  const fromAgw = archFromAgw(agw);
  if (fromAgw) return fromAgw;
  const details = preloaded ??
    (appid ? await steamDetails(appid).catch(() => null) : null);
  return archFromSteamReqs(details?.macRequirements) ?? archFromReleaseYear(details?.releaseYear);
}
