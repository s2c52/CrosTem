// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Detection of the native Mac binary architecture (M Series vs Intel).
// Signal chain: AppleGamingWiki (native/rosetta2, explicit) →
// Steam Mac requirements (text, inferred) → release year (heuristic).
// Everything inferred carries approximate=true and is rendered with "~".
import { agwLookup } from './agw';
import { steamDetails } from './client';
import { getSettings } from './settings';
import type { AgwCompat, AgwStatus, ArchInfo, SteamDetails } from '../types';

// AGW statuses that imply that mode exists and launches.
const POSITIVE: readonly AgwStatus[] = ['perfect', 'playable', 'runs', 'menu'];
const NEGATIVE: readonly AgwStatus[] = ['na', "doesn't work", 'unplayable'];

export function archFromAgw(agw: AgwCompat | null): ArchInfo | null {
  if (!agw) return null;
  if (POSITIVE.includes(agw.native)) {
    return { arch: 'm-series', approximate: false, source: 'agw' };
  }
  if (POSITIVE.includes(agw.rosetta2)) {
    // negative native → definitely Intel binary; unknown native → probably
    // Intel-only, but AGW may simply not have filled in the cell.
    return { arch: 'intel', approximate: !NEGATIVE.includes(agw.native), source: 'agw' };
  }
  return null;
}

const ROSETTA_RE = /rosetta/i; // reqs mentioning Rosetta ⇒ Intel binary
const M_RE = /apple\s+silicon|\bm[1-4](\s+(pro|max|ultra|chip))?\b|\barm64\b/i;
const INTEL_RE = /\bintel\b|\bx86\b|\bx64\b/i;

export function archFromSteamReqs(reqs: string | null | undefined): ArchInfo | null {
  if (!reqs) return null;
  // Rosetta first (even if they mention "M1" it's translation); Apple Silicon
  // before Intel so "Intel or Apple Silicon" (universal) counts as M Series.
  if (ROSETTA_RE.test(reqs)) return { arch: 'intel', approximate: true, source: 'steam-reqs' };
  if (M_RE.test(reqs)) return { arch: 'm-series', approximate: true, source: 'steam-reqs' };
  if (INTEL_RE.test(reqs)) return { arch: 'intel', approximate: true, source: 'steam-reqs' };
  return null;
}

// M-series Macs shipped in late 2020: before that only Intel binaries existed.
export function archFromReleaseYear(year: number | null | undefined): ArchInfo | null {
  if (!year) return null;
  return { arch: year >= 2021 ? 'm-series' : 'intel', approximate: true, source: 'date' };
}

/** Pure signal chain: AGW → Steam requirements → date. */
export function detectArch(agw: AgwCompat | null, steam: SteamDetails | null): ArchInfo | null {
  return archFromAgw(agw)
    ?? archFromSteamReqs(steam?.macRequirements)
    ?? archFromReleaseYear(steam?.releaseYear);
}

/**
 * Resolves a native game's architecture by querying the sources
 * (with their caches). Only requests appdetails if AGW gave no signal and
 * it wasn't preloaded. Never throws: no data → null.
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
