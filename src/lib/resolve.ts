// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared verdict resolution pipeline. Runs the enabled sources in
// parallel and synthesizes the combined verdict. Used by the game-page
// widget and the popup — network access already goes through the service
// worker (fetchExt), so this module works in any extension context.
import { agwLookupDetailed, type AgwLookup } from './agw';
import { anticheatLookup } from './awacy';
import { resolveCw, type CwResolution } from './cw';
import { getSettings } from './settings';
import { computeVerdict } from './verdict';
import type { AgwCompat, AnticheatInfo, RankedResult, VerdictLevel } from '../types';

export interface GameResolution {
  cw: CwResolution;
  agw: AgwCompat | null;
  /** Plausible AGW pages, for the "wrong match?" correction picker. */
  agwCandidates: RankedResult[];
  ac: AnticheatInfo | null;
  verdict: VerdictLevel;
}

const EMPTY_AGW: AgwLookup = { result: null, candidates: [] };

export interface ResolveGameOpts {
  /** Re-open the CodeWeavers candidate picker even if a match is saved. */
  forcePicker?: boolean;
  /** Fetch the full CodeWeavers app page (versions, last tested). */
  loadAppPage?: boolean;
}

/**
 * Resolve every enabled source for a game and compute the verdict.
 * AGW and anticheat failures never break the result; a CodeWeavers
 * `ambiguous` resolution is returned as-is so callers can open a picker.
 */
export async function resolveGame(
  gameName: string,
  appid: string,
  opts: ResolveGameOpts = {},
): Promise<GameResolution> {
  const sources = (await getSettings()).sources;
  const [cw, agwLookup, ac] = await Promise.all([
    sources.cw
      ? resolveCw(gameName, appid, {
          forcePicker: opts.forcePicker ?? false,
          loadAppPage: opts.loadAppPage ?? true,
        })
      : Promise.resolve<CwResolution>({ kind: 'none' }),
    sources.agw
      ? agwLookupDetailed(gameName, appid).catch(() => EMPTY_AGW)
      : Promise.resolve(EMPTY_AGW),
    sources.anticheat ? anticheatLookup(appid, gameName).catch(() => null) : Promise.resolve(null),
  ]);
  const cwApp = cw.kind === 'hit' ? cw.app : null;
  const verdict = computeVerdict(cwApp?.mac ?? null, agwLookup.result, ac);
  return { cw, agw: agwLookup.result, agwCandidates: agwLookup.candidates, ac, verdict };
}
