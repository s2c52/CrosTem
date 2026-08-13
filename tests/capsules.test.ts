// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Capsules surface: the hover-card fixup gate (ordinary flushes skip the
// document-wide overlay walk; card markup triggers it and migrates the
// overlay) and the geometric suppression (covered overlays hide, the
// signature memo skips repeated identical passes, the no-card fast path
// clears leftovers).
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { SCAN_DEBOUNCE_MS } from '../src/lib/constants';
import { stubChrome, type ChromeMock } from './chrome-mock';

const SUPPRESS_TICK_MS = 150; // mouseover coalesce window in capsules.ts

let mock: ChromeMock;
let gbcrSpy: MockInstance;
const rects = new Map<Element, DOMRect>();

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function capsule(appid: string, name: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = `/app/${appid}/${name.replace(/\s+/g, '_')}/`;
  const img = document.createElement('img');
  img.alt = name;
  a.appendChild(img);
  return a;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mock = stubChrome();
  mock.onSendMessage(() => ({ ok: false, error: 'offline for test', code: 'network' }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  gbcrSpy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element) {
      return rects.get(this) ?? rect(0, 0, 0, 0);
    });
});

afterEach(() => {
  // Stop THIS test's surface instance: the document is shared across
  // tests, so a still-mounted instance would keep its mouseover listener
  // and scanner alive and react to later tests' DOM.
  mock.emitStorageChange({ settings: { newValue: { surfaces: { capsules: false } } } }, 'sync');
  rects.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

async function mountCapsules(): Promise<void> {
  await import('../src/content/capsules');
  await vi.advanceTimersByTimeAsync(0); // let the i18n + surface IIFE settle
}

async function flushScanner(): Promise<void> {
  await vi.advanceTimersByTimeAsync(SCAN_DEBOUNCE_MS);
}

describe('fixup gate', () => {
  it('un flush sin marcas de hover card se salta el paseo de overlays', async () => {
    document.body.appendChild(capsule('1', 'Game One'));
    await mountCapsules();
    expect(document.querySelectorAll('.crostem-overlay')).toHaveLength(1);

    const qsa = vi.spyOn(document, 'querySelectorAll');
    const overlayWalks = (): number =>
      qsa.mock.calls.filter(([sel]) => sel === '.crostem-overlay').length;
    const before = overlayWalks();
    document.body.appendChild(capsule('2', 'Game Two'));
    await flushScanner();
    const during = overlayWalks() - before;
    qsa.mockRestore();

    expect(during).toBe(0); // fixup skipped: no card markup in the roots
    expect(document.querySelectorAll('.crostem-overlay')).toHaveLength(2); // scan still ran
  });

  it('la hidratación de una card dispara el fixup y migra el overlay', async () => {
    const a = capsule('1', 'Game One');
    document.body.appendChild(a);
    await mountCapsules();
    expect(a.querySelector('.crostem-overlay')).not.toBeNull();

    // React hydrates the wishlist button inside the anchor: the anchor is
    // now a hover-card hero and must lose its classic overlay.
    const wl = document.createElement('div');
    wl.className = 'WishlistButton_x1y2';
    a.appendChild(wl);
    await flushScanner();

    expect(a.querySelector('.crostem-overlay')).toBeNull();
    expect(a.dataset.crostemHoverHero).toBe('1');
  });
});

describe('suppressCoveredOverlays', () => {
  it('suprime lo cubierto, respeta lo libre, y la firma evita pasadas repetidas', async () => {
    const covered = capsule('1', 'Covered');
    const free = capsule('2', 'Free');
    const card = document.createElement('div');
    card.className = 'LibraryAssetExpandedDisplay';
    document.body.append(covered, free, card);
    rects.set(card, rect(0, 0, 400, 400));
    await mountCapsules();

    const covOverlay = covered.querySelector<HTMLElement>('.crostem-overlay');
    const freeOverlay = free.querySelector<HTMLElement>('.crostem-overlay');
    if (!covOverlay || !freeOverlay) throw new Error('overlays not mounted');
    rects.set(covOverlay, rect(10, 10, 50, 50));
    rects.set(freeOverlay, rect(1000, 1000, 50, 50));

    // Nudge the card so the signature changes and the pass recomputes.
    rects.set(card, rect(0, 0, 410, 400));
    document.dispatchEvent(new MouseEvent('mouseover'));
    await vi.advanceTimersByTimeAsync(SUPPRESS_TICK_MS);
    expect(covOverlay.classList.contains('crostem-overlay-suppressed')).toBe(true);
    expect(freeOverlay.classList.contains('crostem-overlay-suppressed')).toBe(false);

    // Identical geometry: the memoized signature skips the overlay reads
    // (only the region rect is measured again).
    const before = gbcrSpy.mock.calls.length;
    document.dispatchEvent(new MouseEvent('mouseover'));
    await vi.advanceTimersByTimeAsync(SUPPRESS_TICK_MS);
    expect(gbcrSpy.mock.calls.length - before).toBe(1);
    expect(covOverlay.classList.contains('crostem-overlay-suppressed')).toBe(true);

    // Card gone: the fast path clears the leftover suppression.
    card.remove();
    document.dispatchEvent(new MouseEvent('mouseover'));
    await vi.advanceTimersByTimeAsync(SUPPRESS_TICK_MS);
    expect(covOverlay.classList.contains('crostem-overlay-suppressed')).toBe(false);
  });
});
