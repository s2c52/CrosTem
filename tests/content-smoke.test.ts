// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// DOM smoke tests for the content scripts: they self-execute on import,
// so each test stubs chrome + fetch, seeds the fixture DOM and imports
// the module fresh. Covers the happy mount and the degraded path (all
// sources failing must yield a friendly state, never an exception).
// Note: the wishlist surface-off test runs before the surface-on one so
// no MutationObserver from a previous import can touch its DOM.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubChrome, type ChromeMock } from './chrome-mock';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const APP_HTML = readFileSync(join(FIXTURES, 'steam_app.html'), 'utf8');
const WISHLIST_HTML = readFileSync(join(FIXTURES, 'steam_wishlist.html'), 'utf8');

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

  it('inserta un badge tras el enlace de título e ignora el de imagen', async () => {
    document.body.innerHTML = WISHLIST_HTML;
    window.history.pushState({}, '', '/wishlist/profiles/123/');
    await import('../src/content/wishlist');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(1);
    });
    const badge = document.querySelector('.crostem-badge');
    expect(badge?.previousElementSibling?.textContent).toBe('Stardew Valley');
  });

  it('aplica en vivo el toggle de la superficie (off → limpia, on → remonta)', async () => {
    document.body.innerHTML = WISHLIST_HTML;
    window.history.pushState({}, '', '/wishlist/profiles/123/');
    await import('../src/content/wishlist');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(1);
    });

    mock.emitStorageChange({ settings: { newValue: { surfaces: { wishlist: false } } } }, 'sync');
    expect(document.querySelectorAll('.crostem-badge').length).toBe(0);
    expect(document.querySelector('a[data-crostem]')).toBeNull();

    mock.emitStorageChange({ settings: { newValue: { surfaces: { wishlist: true } } } }, 'sync');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.crostem-badge').length).toBe(1);
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
