// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Automatic badge resolution shared by capsules, search and wishlist.
// Elements are registered with attach(); a shared IntersectionObserver
// only resolves the ones that become visible, minimizing requests
// (on top of the 7/30-day caches). Since F2 the result includes the
// combined verdict traffic light (CodeWeavers + AGW + anticheat).
import { agwLookup } from './agw';
import { resolveNativeArch } from './arch';
import { anticheatLookup } from './awacy';
import { type SwrPass } from './cache';
import { steamDetails } from './client';
import { LAZY_ROOT_MARGIN } from './constants';
import { resolveCw } from './cw';
import { logDebug, logWarn } from './log';
import { computeVerdict } from './verdict';
import { getSettings } from './settings';
import { renderBadge } from './badge';
import {
  codeForResult,
  loadPrimedIndex,
  notePrimed,
  resultForCode,
  type PrimedCode,
} from './primed';
import type {
  AutoAttachOpts,
  CwSignal,
  ResolveResult,
  SteamDetails as SteamDetailsT,
} from '../types';

const registry = new WeakMap<Element, AutoAttachOpts>();

// Primed paint: the persisted appid->code map arrives async; elements
// attached before it lands wait in pendingPrime and get their synchronous
// paint as soon as the load resolves (that covers the initial screenful,
// the case priming exists for). No onChanged refresh: extension pages
// resolve their own badges, so one load per page is enough.
let primed: Map<string, PrimedCode> | null = null;
const pendingPrime = new Map<HTMLElement, AutoAttachOpts>();

void loadPrimedIndex().then((map) => {
  primed = map;
  for (const [el, opts] of pendingPrime) {
    if (el.isConnected) primeBadge(el, opts);
  }
  pendingPrime.clear();
});

/** Paints the remembered verdict synchronously; the real resolution
 * replaces it in place when it lands. */
function primeBadge(el: HTMLElement, opts: AutoAttachOpts): void {
  const code = opts.appid ? primed?.get(opts.appid) : undefined;
  if (code === undefined) return;
  renderBadge(el, resultForCode(code), opts);
}

const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      const opts = registry.get(entry.target);
      registry.delete(entry.target);
      if (opts) void resolveAndRender(entry.target as HTMLElement, opts);
    }
  },
  { rootMargin: LAZY_ROOT_MARGIN },
);

/** Unregisters an element (surface teardown): stops observing it and
 * drops its pending resolution. Safe on elements never attached. */
export function detach(el: Element): void {
  io.unobserve(el);
  registry.delete(el);
  pendingPrime.delete(el as HTMLElement);
}

export function attach(el: HTMLElement, opts: AutoAttachOpts): void {
  if (opts.native === true) {
    // Immediate provisional badge (5★ without architecture); the architecture
    // is resolved lazily via the observer if there are hints to query the sources.
    renderBadge(el, { kind: 'native', arch: null }, opts);
    notePrimed(opts.appid, 'n');
    if (!opts.appid && !opts.name) return;
  } else if (primed) {
    primeBadge(el, opts);
  } else {
    pendingPrime.set(el, opts);
  }
  registry.set(el, opts);
  io.observe(el);
}

async function resolveAndRender(el: HTMLElement, opts: AutoAttachOpts): Promise<void> {
  try {
    // First pass may serve entries past their TTL (stale window): the
    // badge paints instantly and, if anything stale was used, a strict
    // second pass refetches just the expired sources and silently
    // re-renders when the outcome changed.
    const swr: SwrPass = { staleServed: false };
    const onPartial = (partial: ResolveResult): void => renderBadge(el, partial, opts);
    const first = await resolve(opts, swr, onPartial);
    renderBadge(el, first, opts);
    notePrimed(opts.appid, codeForResult(first));
    if (swr.staleServed) {
      const fresh = await resolve(opts);
      if (JSON.stringify(fresh) !== JSON.stringify(first)) renderBadge(el, fresh, opts);
      notePrimed(opts.appid, codeForResult(fresh));
    }
  } catch (e) {
    logWarn('badge resolution failed', e);
    // Never remove the provisional native badge because of a network failure.
    renderBadge(el, opts.native === true ? { kind: 'native', arch: null } : { kind: 'none' }, opts);
  }
}

async function resolve(
  opts: AutoAttachOpts,
  swr?: SwrPass,
  onPartial?: (partial: ResolveResult) => void,
): Promise<ResolveResult> {
  let name = opts.name ?? null;
  let native = opts.native; // undefined = unknown
  let details: SteamDetailsT | null = null;

  if ((name == null || native == null) && opts.appid) {
    try {
      details = await steamDetails(opts.appid, swr);
      if (details) {
        if (name == null) name = details.name;
        if (native == null) native = details.mac;
      }
    } catch (e) {
      // Steam failed; carry on with what we have.
      logDebug('steam details unavailable', e);
    }
  }

  if (native === true) {
    return { kind: 'native', arch: await resolveNativeArch(name, opts.appid, details) };
  }
  if (!name) return { kind: 'none' };

  const settings = await getSettings();

  // Secondary sources in parallel with the CodeWeavers resolution
  // (each can be disabled in the options).
  const agwPromise = settings.sources.agw
    ? agwLookup(name, opts.appid, swr).catch((e: unknown) => {
        logDebug('AGW lookup failed', e);
        return null;
      })
    : Promise.resolve(null);
  const acPromise = settings.sources.anticheat
    ? anticheatLookup(opts.appid, name, swr).catch((e: unknown) => {
        logDebug('anticheat lookup failed', e);
        return null;
      })
    : Promise.resolve(null);

  // CodeWeavers: user choice > name matching.
  let cwSignal: CwSignal | null = null;
  let cwOutcome:
    | { type: 'hit'; stars: number | null; slug: string; cwName: string; approximate: boolean }
    | { type: 'ambiguous'; count: number }
    | { type: 'none' } = { type: 'none' };

  if (settings.sources.cw) {
    // A CodeWeavers failure (source down, breaker open) must not kill
    // the badge: AGW/anticheat are already resolving in parallel and
    // their verdict alone is still worth showing.
    try {
      const res = await resolveCw(name, opts.appid, swr ? { swr } : {});
      if (res.kind === 'hit') {
        cwSignal = res.app?.mac
          ? { stars: res.stars, status: res.app.mac.status }
          : { stars: res.stars };
        cwOutcome = {
          type: 'hit',
          stars: res.stars,
          slug: res.slug,
          cwName: res.cwName,
          approximate: res.approximate,
        };
      } else if (res.kind === 'ambiguous') {
        cwOutcome = { type: 'ambiguous', count: res.candidates.length };
      }
    } catch (e) {
      logDebug('CW resolution failed, degrading to secondary sources', e);
    }
  }

  // First-signal render: paint the stars with the CW-only verdict right
  // away; the full verdict below refines it (rarely visibly — only when
  // AGW/anticheat change the traffic light, e.g. an anticheat Denied).
  if (onPartial && cwOutcome.type === 'hit') {
    onPartial({
      kind: 'stars',
      stars: cwOutcome.stars,
      slug: cwOutcome.slug,
      cwName: cwOutcome.cwName,
      approximate: cwOutcome.approximate,
      level: computeVerdict(cwSignal, null, null),
    });
  }

  const [agw, ac] = await Promise.all([agwPromise, acPromise]);
  const verdict = computeVerdict(cwSignal, agw, ac);

  if (cwOutcome.type === 'hit') {
    return {
      kind: 'stars',
      stars: cwOutcome.stars,
      slug: cwOutcome.slug,
      cwName: cwOutcome.cwName,
      approximate: cwOutcome.approximate,
      level: verdict,
    };
  }
  if (cwOutcome.type === 'ambiguous') {
    return { kind: 'ambiguous', count: cwOutcome.count, query: name, level: verdict };
  }
  // No CodeWeavers but with an AGW/anticheat signal: the traffic light alone.
  if (verdict !== 'unknown') {
    return { kind: 'dot', level: verdict };
  }
  return { kind: 'none' };
}

