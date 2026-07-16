// Resolución automática de badges compartida por cápsulas, búsqueda y
// wishlist. Los elementos se registran con attach(); un IntersectionObserver
// compartido solo resuelve los que se hacen visibles, minimizando peticiones
// a CodeWeavers y Steam (además de las cachés de 7/30 días).
import * as cache from './cache';
import { appUrl, getApp, search, searchUrl, steamDetails } from './client';
import { rank } from './matcher';
import { starsEl } from './widget';
import type { AutoAttachOpts, ResolveResult } from '../types';

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

  // Una coincidencia confirmada por el usuario gana al matching por nombre.
  if (opts.appid) {
    const savedSlug = await cache.getSlugChoice(opts.appid);
    if (savedSlug) {
      const app = await getApp(savedSlug);
      if (app?.mac) {
        return { kind: 'stars', stars: app.mac.stars, slug: savedSlug, cwName: name, approximate: false };
      }
    }
  }

  const results = await search(name);
  const ranked = rank(name, results);
  if (ranked.confident) {
    return {
      kind: 'stars',
      stars: ranked.confident.stars,
      slug: ranked.confident.slug,
      cwName: ranked.confident.name,
      approximate: ranked.confident.score < 1,
    };
  }
  // Un único candidato plausible merece mostrarse como aproximado; solo los
  // casos genuinamente ambiguos (2+) derivan a CodeWeavers.
  if (ranked.candidates.length === 1) {
    const only = ranked.candidates[0];
    return { kind: 'stars', stars: only.stars, slug: only.slug, cwName: only.name, approximate: true };
  }
  if (ranked.candidates.length > 1) {
    return { kind: 'ambiguous', count: ranked.candidates.length, query: name };
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
      a.textContent = overlay ? '?' : `${result.count} matches ↗`;
      el.appendChild(a);
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
