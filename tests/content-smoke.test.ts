// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// DOM smoke tests for the content scripts: they self-execute on import,
// so each test stubs chrome + fetch, seeds the fixture DOM and imports
// the module fresh. Covers the happy mount and the degraded path (all
// sources failing must yield a friendly state, never an exception).
// Note: for the scanner-based surfaces (wishlist, library) the
// surface-off test runs before the surface-on ones so no MutationObserver
// from a previous import can touch its DOM.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubChrome, type ChromeMock } from './chrome-mock';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const APP_HTML = readFileSync(join(FIXTURES, 'steam_app.html'), 'utf8');
const WISHLIST_HTML = readFileSync(join(FIXTURES, 'steam_wishlist.html'), 'utf8');
const LIBRARY_HTML = readFileSync(join(FIXTURES, 'steam_community_games.html'), 'utf8');

const BREAKER_OPEN = { ok: false, error: 'circuit open for test', code: 'breaker-open' };

let mock: ChromeMock;

beforeEach(() => {
  vi.resetModules();
  mock = stubChrome();
  mock.onSendMessage(() => BREAKER_OPEN);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  // Locale dictionaries resolve empty (t() falls back to the key);
  // every other request 404s without retries.
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => {
      if (String(url).includes('locales/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        url: String(url),
        headers: { get: () => null },
        text: () => Promise.resolve(''),
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('content/app.ts', () => {
  it('monta el badge nativo cuando Steam marca la plataforma mac', async () => {
    document.body.innerHTML = APP_HTML;
    document.querySelector('.platform_img')?.classList.add('mac');
    window.history.pushState({}, '', '/app/1245620/ELDEN_RING/');
    await import('../src/content/app');
    await vi.waitFor(() => {
      const widget = document.querySelector('#crostem-widget');
      expect(widget?.textContent?.trim()).toBeTruthy();
    });
    expect(document.querySelector('#crostem-widget .crostem-skeleton')).toBeNull();
  });

  it('degrada a un error amable cuando todas las fuentes fallan', async () => {
    document.body.innerHTML = APP_HTML; // Windows-only game
    window.history.pushState({}, '', '/app/1245620/ELDEN_RING/');
    await import('../src/content/app');
    await vi.waitFor(() => {
      const widget = document.querySelector('#crostem-widget');
      // Empty dicts make t() return the key itself.
      expect(widget?.textContent ?? '').toContain('errorFriendly');
    });
    expect(document.querySelector('#crostem-widget .crostem-skeleton')).toBeNull();
  });
});

describe('content/wishlist.ts', () => {
  it('respeta la superficie desactivada sin tocar el DOM', async () => {
    mock.sync['settings'] = { surfaces: { wishlist: false } };
    document.body.innerHTML = WISHLIST_HTML;
    window.history.pushState({}, '', '/wishlist/profiles/123/');
    await import('../src/content/wishlist');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelectorAll('.crostem-badge').length).toBe(0);
  });

  it('inserta un badge tras cada enlace de título e ignora los de imagen', async () => {
    document.body.innerHTML = WISHLIST_HTML;
    window.history.pushState({}, '', '/wishlist/profiles/123/');
    await import('../src/content/wishlist');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(2);
    });
    const badge = document.querySelector('.crostem-badge');
    expect(badge?.previousElementSibling?.textContent).toBe('Papers, Please');
    // Only the title anchors get stamped; capsule-image anchors are skipped.
    const stamped = document.querySelectorAll<HTMLAnchorElement>('a[data-crostem]');
    expect(stamped.length).toBe(2);
    stamped.forEach((a) => {
      expect(a.textContent?.trim()).toBeTruthy();
    });
  });

  it('aplica en vivo el toggle de la superficie (off → limpia, on → remonta)', async () => {
    document.body.innerHTML = WISHLIST_HTML;
    window.history.pushState({}, '', '/wishlist/profiles/123/');
    await import('../src/content/wishlist');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(2);
    });

    mock.emitStorageChange({ settings: { newValue: { surfaces: { wishlist: false } } } }, 'sync');
    expect(document.querySelectorAll('.crostem-badge').length).toBe(0);
    expect(document.querySelector('a[data-crostem]')).toBeNull();

    mock.emitStorageChange({ settings: { newValue: { surfaces: { wishlist: true } } } }, 'sync');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(2);
    });
  });
});

describe('content/library.ts', () => {
  const LIBRARY_URL = '/id/s2c52/games?tab=all';

  it('respeta la superficie desactivada sin tocar el DOM', async () => {
    mock.sync['settings'] = { surfaces: { library: false } };
    document.body.innerHTML = LIBRARY_HTML;
    window.history.pushState({}, '', LIBRARY_URL);
    await import('../src/content/library');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelectorAll('.crostem-badge').length).toBe(0);
  });

  it('un solo badge por juego, tras el título y no en la carátula', async () => {
    document.body.innerHTML = LIBRARY_HTML;
    window.history.pushState({}, '', LIBRARY_URL);
    await import('../src/content/library');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(2);
    });

    const badges = document.querySelectorAll<HTMLElement>('.crostem-badge');
    expect([...badges].map((b) => b.previousElementSibling?.textContent?.trim())).toEqual([
      'Lost Ark',
      'Counter-Strike 2',
    ]);
    expect([...badges].map((b) => b.dataset.crostemAppid)).toEqual(['1599340', '730']);
    // The capsule anchor wraps an image and carries no title: never stamped.
    expect(document.querySelector('a[data-crostem] img')).toBeNull();
    // The row also links the same app from its "Store Page" entry, which
    // must not earn a second badge.
    expect(document.querySelectorAll('a[href*="/app/1599340"]').length).toBe(3);
    expect(document.querySelectorAll('.crostem-badge[data-crostem-appid="1599340"]').length).toBe(
      1,
    );
  });

  it('si el virtualizador recicla un nodo, el badge se rehace para el juego nuevo', async () => {
    document.body.innerHTML = LIBRARY_HTML;
    window.history.pushState({}, '', LIBRARY_URL);
    await import('../src/content/library');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(2);
    });

    // Recycling = the same anchor node re-pointed at another game, rather
    // than the row being unmounted and a fresh one mounted.
    const title = document.querySelector<HTMLAnchorElement>('a[data-crostem="730"]');
    const row = title?.closest('.Panel');
    if (!title || !row) throw new Error('fixture row not found');
    title.setAttribute('href', 'https://steamcommunity.com/app/570');
    title.textContent = 'Dota 2';
    // Re-attach the row so the scanner revisits it (a bare attribute edit
    // is invisible to a childList observer).
    const parent = row.parentNode;
    row.remove();
    parent?.appendChild(row);

    await vi.waitFor(() => {
      expect(document.querySelector('.crostem-badge[data-crostem-appid="570"]')).not.toBeNull();
    });
    expect(document.querySelector('.crostem-badge[data-crostem-appid="730"]')).toBeNull();
    expect(document.querySelectorAll('.crostem-badge').length).toBe(2);
    expect(title.dataset.crostem).toBe('570');
  });

  it('aplica en vivo el toggle de la superficie (off → limpia, on → remonta)', async () => {
    document.body.innerHTML = LIBRARY_HTML;
    window.history.pushState({}, '', LIBRARY_URL);
    await import('../src/content/library');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(2);
    });

    mock.emitStorageChange({ settings: { newValue: { surfaces: { library: false } } } }, 'sync');
    expect(document.querySelectorAll('.crostem-badge').length).toBe(0);
    expect(document.querySelector('a[data-crostem]')).toBeNull();

    mock.emitStorageChange({ settings: { newValue: { surfaces: { library: true } } } }, 'sync');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(2);
    });
  });
});

describe('live-apply del widget de ficha', () => {
  it('desmonta y remonta el widget al cambiar surfaces.app', async () => {
    document.body.innerHTML = APP_HTML;
    document.querySelector('.platform_img')?.classList.add('mac');
    window.history.pushState({}, '', '/app/1245620/ELDEN_RING/');
    await import('../src/content/app');
    await vi.waitFor(() => {
      expect(document.querySelector('#crostem-widget')).not.toBeNull();
    });

    mock.emitStorageChange({ settings: { newValue: { surfaces: { app: false } } } }, 'sync');
    expect(document.querySelector('#crostem-widget')).toBeNull();

    mock.emitStorageChange({ settings: { newValue: { surfaces: { app: true } } } }, 'sync');
    await vi.waitFor(() => {
      expect(document.querySelector('#crostem-widget')).not.toBeNull();
    });
  });
});

// Last on purpose: capsules.ts leaves a body-wide MutationObserver running
// after import, and this file's tests share the document.
describe('content/capsules.ts', () => {
  it('superpone estrellas en capsules pero ignora los Points Shop Items', async () => {
    document.body.innerHTML = `
      <a href="https://store.steampowered.com/app/1245620/ELDEN_RING/"><img alt="ELDEN RING" /></a>
      <a href="https://store.steampowered.com/points/shop/app/1324780/reward/150637/"><img alt="Reward" /></a>
    `;
    window.history.pushState({}, '', '/app/1324780/Easy_Red_2/');
    await import('../src/content/capsules');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-overlay').length).toBe(1);
    });
    expect(document.querySelector('.crostem-overlay')?.closest('a')?.getAttribute('href')).toContain(
      '/app/1245620/',
    );
    const pointsShop = document.querySelector<HTMLElement>('a[href*="/points/shop/"]');
    expect(pointsShop?.querySelector('.crostem-overlay')).toBeNull();
    expect(pointsShop?.dataset.crostemCapsule).toBeUndefined();
  });
});
