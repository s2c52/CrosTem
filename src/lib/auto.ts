// Resolución automática de badges compartida por cápsulas, búsqueda y
// wishlist. Los elementos se registran con attach(); un IntersectionObserver
// compartido solo resuelve los que se hacen visibles, minimizando peticiones
// (además de las cachés de 7/30 días). Desde F2 el resultado incluye el
// semáforo del veredicto combinado (CodeWeavers + AGW + anticheat).
import { agwLookup } from './agw';
import { anticheatLookup } from './awacy';
import * as cache from './cache';
import { appUrl, getApp, search, searchUrl, steamDetails } from './client';
import { rank } from './matcher';
import { computeVerdict } from './verdict';
import { dotEl, starsEl } from './widget';
import type { AutoAttachOpts, CwSignal, ResolveResult } from '../types';

const registry = new WeakMap<Element, AutoAttachOpts>();

const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    io.unobserve(entry.target);
    const opts = registry.get(entry.target);
    registry.delete(entry.target);
    if (opts) void resolveAndRender(entry.target as HTMLElement, opts);
  }
}, { rootMargin: '150px' });

export function attach(el: HTMLElement, opts: AutoAttachOpts): void {
  if (opts.native === true) {
    render(el, { kind: 'native' }, opts);
    return;
  }
  registry.set(el, opts);
  io.observe(el);
}

async function resolveAndRender(el: HTMLElement, opts: AutoAttachOpts): Promise<void> {
  try {
    render(el, await resolve(opts), opts);
  } catch {
    render(el, { kind: 'none' }, opts);
  }
}

async function resolve(opts: AutoAttachOpts): Promise<ResolveResult> {
  let name = opts.name ?? null;
  let native = opts.native; // undefined = desconocido

  if ((name == null || native == null) && opts.appid) {
    try {
      const details = await steamDetails(opts.appid);
      if (details) {
        if (name == null) name = details.name;
        if (native == null) native = details.mac;
      }
    } catch {
      // Falló Steam; seguimos con lo que tengamos
    }
  }

  if (native === true) return { kind: 'native' };
  if (!name) return { kind: 'none' };

  // Fuentes secundarias en paralelo con la resolución de CodeWeavers.
  const agwPromise = agwLookup(name, opts.appid).catch(() => null);
  const acPromise = anticheatLookup(opts.appid, name).catch(() => null);

  // CodeWeavers: elección del usuario > matching por nombre.
  let cwSignal: CwSignal | null = null;
  let cwOutcome:
    | { type: 'hit'; stars: number | null; slug: string; cwName: string; approximate: boolean }
    | { type: 'ambiguous'; count: number }
    | { type: 'none' } = { type: 'none' };

  const savedSlug = opts.appid ? await cache.getSourceChoice('cw', opts.appid) : undefined;
  if (savedSlug) {
    const app = await getApp(savedSlug);
    if (app?.mac) {
      cwSignal = { stars: app.mac.stars, status: app.mac.status };
      cwOutcome = { type: 'hit', stars: app.mac.stars, slug: savedSlug, cwName: name, approximate: false };
    }
  }
  if (cwOutcome.type === 'none') {
    const results = await search(name);
    const ranked = rank(name, results);
    const pick = ranked.confident ?? (ranked.candidates.length === 1 ? ranked.candidates[0] : null);
    if (pick) {
      cwSignal = { stars: pick.stars };
      cwOutcome = { type: 'hit', stars: pick.stars, slug: pick.slug, cwName: pick.name, approximate: pick.score < 1 };
    } else if (ranked.candidates.length > 1) {
      cwOutcome = { type: 'ambiguous', count: ranked.candidates.length };
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
  // Sin CodeWeavers pero con señal de AGW/anticheat: el semáforo solo.
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
  // Las cápsulas/filas son a su vez enlaces con handlers JS; este clic es nuestro.
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
      span.textContent = overlay ? '' : ' native';
      span.title = 'Native on macOS';
      el.appendChild(span);
      break;
    }
    case 'stars': {
      const a = cwLink(appUrl(result.slug),
        `${result.cwName} — CrossOver rating on CodeWeavers` +
        (result.approximate ? ' (approximate match)' : ''));
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
      a.appendChild(document.createTextNode(overlay ? '?' : `${result.count} matches ↗`));
      el.appendChild(a);
      break;
    }
    case 'dot': {
      el.appendChild(dotEl(result.level, result.title));
      break;
    }
    default: {
      if (overlay) {
        el.remove();
      } else {
        const span = document.createElement('span');
        span.className = 'crostem-muted crostem-small';
        span.textContent = 'no data';
        el.appendChild(span);
      }
    }
  }
}
