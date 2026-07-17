// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared verdict resolution pipeline. Runs the enabled sources in
// parallel and synthesizes the combined verdict. Used by the game-page
// widget and the popup — network access already goes through the service
// worker (fetchExt), so this module works in any extension context.
import { agwLookup } from './agw';
import { anticheatLookup } from './awacy';
import { resolveCw, type CwResolution } from './cw';
import { getSettings } from './settings';
import { computeVerdict } from './verdict';
import type { AgwCompat, AnticheatInfo, Verdict } from '../types';

export interface GameResolution {
  cw: CwResolution;
  agw: AgwCompat | null;
  ac: AnticheatInfo | null;
  verdict: Verdict;
}

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
  const [cw, agw, ac] = await Promise.all([
    sources.cw
      ? resolveCw(gameName, appid, {
          forcePicker: opts.forcePicker ?? false,
          loadAppPage: opts.loadAppPage ?? true,
        })
      : Promise.resolve<CwResolution>({ kind: 'none' }),
    sources.agw ? agwLookup(gameName, appid).catch(() => null) : Promise.resolve(null),
    sources.anticheat ? anticheatLookup(appid, gameName).catch(() => null) : Promise.resolve(null),
  ]);
  const cwApp = cw.kind === 'hit' ? cw.app : null;
  const verdict = computeVerdict(cwApp?.mac ?? null, agw, ac);
  return { cw, agw, ac, verdict };
}
