// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Search surface on the shared incremental scanner: initial rows badge
// once, AJAX-appended rows badge incrementally without reprocessing the
// container, and our own badge churn never duplicates badges.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCAN_DEBOUNCE_MS } from '../src/lib/constants';
import { stubChrome, type ChromeMock } from './chrome-mock';

let mock: ChromeMock;

function row(appid: string, name: string, mac = false): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'search_result_row';
  a.setAttribute('data-ds-appid', appid);
  const nameDiv = document.createElement('div');
  nameDiv.className = 'search_name';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = name;
  nameDiv.appendChild(title);
  a.appendChild(nameDiv);
  if (mac) {
    const icon = document.createElement('span');
    icon.className = 'platform_img mac';
    a.appendChild(icon);
  }
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
});

afterEach(() => {
  // Stop THIS test's surface instance so its scanner cannot react to
  // later tests' DOM (the document is shared across tests).
  mock.emitStorageChange({ settings: { newValue: { surfaces: { search: false } } } }, 'sync');
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

async function mountSearch(): Promise<void> {
  await import('../src/content/search');
  await vi.advanceTimersByTimeAsync(0); // let the i18n + surface IIFE settle
}

describe('content/search.ts', () => {
  it('badgea las filas iniciales una vez, con la señal nativa del icono', async () => {
    const container = document.createElement('div');
    container.id = 'search_resultsRows';
    container.append(row('10', 'Game A'), row('20', 'Game B', true));
    document.body.appendChild(container);
    await mountSearch();

    const badges = document.querySelectorAll('.crostem-badge');
    expect(badges).toHaveLength(2);
    // The native row's badge painted synchronously (attach native path).
    const nativeRow = container.querySelector('[data-ds-appid="20"]');
    expect(nativeRow?.querySelector('.crostem-badge')?.textContent).toBeTruthy();
  });

  it('filas añadidas por AJAX se badgean incrementalmente sin duplicar', async () => {
    const container = document.createElement('div');
    container.id = 'search_resultsRows';
    container.append(row('10', 'Game A'));
    document.body.appendChild(container);
    await mountSearch();
    expect(document.querySelectorAll('.crostem-badge')).toHaveLength(1);

    container.append(row('30', 'Game C'), row('40', 'Game D'));
    await vi.advanceTimersByTimeAsync(SCAN_DEBOUNCE_MS);

    expect(document.querySelectorAll('.crostem-badge')).toHaveLength(3);
    // Every row carries exactly one badge (idempotent dataset guard).
    for (const r of container.querySelectorAll('.search_result_row')) {
      expect(r.querySelectorAll('.crostem-badge')).toHaveLength(1);
    }
  });

  it('el churn de nuestros propios badges no re-arma el scanner', async () => {
    const container = document.createElement('div');
    container.id = 'search_resultsRows';
    container.append(row('20', 'Native Game', true)); // paints synchronously
    document.body.appendChild(container);
    await mountSearch();
    const badge = container.querySelector<HTMLElement>('.crostem-badge');
    if (!badge) throw new Error('badge not mounted');

    // Simulate a render pass appending inside our own badge; the scanner
    // must filter it (no new scan work, no duplicate badges).
    const inner = document.createElement('span');
    badge.appendChild(inner);
    await vi.advanceTimersByTimeAsync(SCAN_DEBOUNCE_MS);
    expect(container.querySelectorAll('.crostem-badge')).toHaveLength(1);
  });
});
