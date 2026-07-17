// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared CodeWeavers resolution used by the game-page widget and the
// lazy badges: saved user choice first, then search + ranking. One
// implementation so the two flows cannot drift apart.
import * as cache from './cache';
import { getApp, search } from './client';
import { rank } from './matcher';
import type { CwAppPage, RankedResult } from '../types';

export type CwResolution =
  | {
      kind: 'hit';
      slug: string;
      cwName: string;
      /** True when the match is not exact (rendered with "~"). */
      approximate: boolean;
      /** Mac stars: from the app page for saved choices, from the search row otherwise. */
      stars: number | null;
      /** Full app page — loaded for saved choices and when loadAppPage is set. */
      app: CwAppPage | null;
    }
  | { kind: 'ambiguous'; candidates: RankedResult[] }
  | { kind: 'none' };

export interface ResolveCwOpts {
  /** Skip the saved choice and the confident auto-pick (the user asked
   * to choose again). */
  forcePicker?: boolean;
  /** Also download the full app page for search matches (widget). */
  loadAppPage?: boolean;
}

export async function resolveCw(
  name: string,
  appid: string | null | undefined,
  opts: ResolveCwOpts = {},
): Promise<CwResolution> {
  if (!opts.forcePicker && appid) {
    const savedSlug = await cache.getSourceChoice('cw', appid);
    if (savedSlug) {
      const app = await getApp(savedSlug);
      if (app?.mac || opts.loadAppPage) {
        return {
          kind: 'hit',
          slug: savedSlug,
          cwName: name,
          approximate: false,
          stars: app?.mac?.stars ?? null,
          app,
        };
      }
      // Saved page without Mac data: fall through to name matching.
    }
  }

  const results = await search(name);
  const ranked = rank(name, results);
  const pick =
    (opts.forcePicker ? null : ranked.confident) ??
    (ranked.candidates.length === 1 ? ranked.candidates[0] : null);
  if (pick) {
    return {
      kind: 'hit',
      slug: pick.slug,
      cwName: pick.name,
      approximate: pick.score < 1,
      stars: pick.stars,
      app: opts.loadAppPage ? await getApp(pick.slug) : null,
    };
  }
  if (ranked.candidates.length > 1) return { kind: 'ambiguous', candidates: ranked.candidates };
  return { kind: 'none' };
}
