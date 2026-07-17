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
import { appUrl, searchUrl, steamDetails } from './client';
import { LAZY_ROOT_MARGIN } from './constants';
import { resolveCw } from './cw';
import { logDebug, logWarn } from './log';
import { computeVerdict } from './verdict';
import { getSettings } from './settings';
import { t } from './i18n';
import { dotEl, starsEl } from './widget';
import type {
  AutoAttachOpts,
  CwSignal,
  ResolveResult,
  SteamDetails as SteamDetailsT,
} from '../types';

const registry = new WeakMap<Element, AutoAttachOpts>();

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

export function attach(el: HTMLElement, opts: AutoAttachOpts): void {
  if (opts.native === true) {
    // Immediate provisional badge (5★ without architecture); the architecture
    // is resolved lazily via the observer if there are hints to query the sources.
    render(el, { kind: 'native', arch: null }, opts);
    if (!opts.appid && !opts.name) return;
  }
  registry.set(el, opts);
  io.observe(el);
}

async function resolveAndRender(el: HTMLElement, opts: AutoAttachOpts): Promise<void> {
  try {
    render(el, await resolve(opts), opts);
  } catch (e) {
    logWarn('badge resolution failed', e);
    // Never remove the provisional native badge because of a network failure.
    render(el, opts.native === true ? { kind: 'native', arch: null } : { kind: 'none' }, opts);
  }
}

async function resolve(opts: AutoAttachOpts): Promise<ResolveResult> {
  let name = opts.name ?? null;
  let native = opts.native; // undefined = unknown
  let details: SteamDetailsT | null = null;

  if ((name == null || native == null) && opts.appid) {
    try {
      details = await steamDetails(opts.appid);
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
    ? agwLookup(name, opts.appid).catch((e: unknown) => {
        logDebug('AGW lookup failed', e);
        return null;
      })
    : Promise.resolve(null);
  const acPromise = settings.sources.anticheat
    ? anticheatLookup(opts.appid, name).catch((e: unknown) => {
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
    const res = await resolveCw(name, opts.appid);
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
      level: verdict.level,
    };
  }
  if (cwOutcome.type === 'ambiguous') {
    return { kind: 'ambiguous', count: cwOutcome.count, query: name, level: verdict.level };
  }
  // No CodeWeavers but with an AGW/anticheat signal: the traffic light alone.
  if (verdict.level !== 'unknown') {
    return { kind: 'dot', level: verdict.level, title: verdict.label };
  }
  return { kind: 'none' };
}

function cwLink(href: string, title?: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'crostem-badge-result';
  if (title) a.title = title;
  // Capsules/rows are themselves links with JS handlers; this click is ours.
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function render(el: HTMLElement, result: ResolveResult, opts: AutoAttachOpts): void {
  el.textContent = '';
  const overlay = opts.mode === 'overlay';

  switch (result.kind) {
    case 'native': {
      const span = document.createElement('span');
      span.className = 'crostem-badge-native';
      span.appendChild(starsEl(5));
      const arch = result.arch;
      if (arch) {
        const tag = document.createElement('span');
        tag.className = 'crostem-arch-tag';
        tag.textContent =
          t(arch.arch === 'm-series' ? 'archMShort' : 'archIntelShort') +
          (arch.approximate ? '~' : '');
        span.appendChild(tag);
      }
      span.title =
        t('nativeBadge') +
        (arch
          ? ' — ' +
            t(arch.arch === 'm-series' ? 'archM' : 'archIntel') +
            (arch.approximate ? ' ~' : '')
          : '');
      el.appendChild(span);
      break;
    }
    case 'stars': {
      const a = cwLink(
        appUrl(result.slug),
        `${result.cwName} — CrossOver rating on CodeWeavers` +
          (result.approximate ? ' (approximate match)' : ''),
      );
      a.appendChild(dotEl(result.level));
      a.appendChild(starsEl(result.stars));
      if (result.approximate) {
        const tilde = document.createElement('span');
        tilde.className = 'crostem-small';
        tilde.textContent = '~';
        a.appendChild(tilde);
      }
      el.appendChild(a);
      break;
    }
    case 'ambiguous': {
      const a = cwLink(searchUrl(result.query), `${result.count} possible matches on CodeWeavers`);
      if (result.level !== 'unknown') a.appendChild(dotEl(result.level));
      a.appendChild(document.createTextNode(overlay ? '?' : t('matchesN', String(result.count))));
      el.appendChild(a);
      break;
    }
    case 'dot': {
      el.appendChild(dotEl(result.level, t('verdict_' + result.level)));
      break;
    }
    default: {
      if (overlay) {
        el.remove();
      } else {
        const span = document.createElement('span');
        span.className = 'crostem-muted crostem-small';
        span.textContent = t('noDataInline');
        el.appendChild(span);
      }
    }
  }
}
