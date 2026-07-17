// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared CodeWeavers resolution (saved choice → search + ranking) used
// by both the widget and the lazy badges. client/cache are mocked: this
// tests the decision logic, not the network.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CwAppPage, CwSearchResult } from '../src/types';

vi.mock('../src/lib/client', () => ({
  getApp: vi.fn(),
  search: vi.fn(),
}));
vi.mock('../src/lib/cache', () => ({
  getSourceChoice: vi.fn(),
}));

import { getSourceChoice } from '../src/lib/cache';
import { getApp, search } from '../src/lib/client';
import { resolveCw } from '../src/lib/cw';

const row = (name: string, slug: string, stars: number | null = 4): CwSearchResult => ({
  name,
  slug,
  company: '',
  lastUpdated: '',
  stars,
});

const appPage = (stars: number | null): CwAppPage => ({
  slug: 'elden-ring',
  mac: { stars, status: 'Runs Great', lastTested: null, reportCount: null },
  linux: null,
  versions: [],
  aggregate: null,
});

beforeEach(() => {
  vi.mocked(getSourceChoice).mockReset().mockResolvedValue(undefined);
  vi.mocked(getApp).mockReset().mockResolvedValue(null);
  vi.mocked(search).mockReset().mockResolvedValue([]);
});

describe('resolveCw', () => {
  it('la elección guardada gana y no busca', async () => {
    vi.mocked(getSourceChoice).mockResolvedValue('elden-ring');
    vi.mocked(getApp).mockResolvedValue(appPage(5));
    const res = await resolveCw('Elden Ring', '123');
    expect(res).toMatchObject({ kind: 'hit', slug: 'elden-ring', approximate: false, stars: 5 });
    expect(search).not.toHaveBeenCalled();
  });

  it('elección guardada sin datos Mac cae al matching por nombre (badges)', async () => {
    vi.mocked(getSourceChoice).mockResolvedValue('some-page');
    vi.mocked(getApp).mockResolvedValue({ ...appPage(null), mac: null });
    vi.mocked(search).mockResolvedValue([row('Elden Ring', 'elden-ring', 5)]);
    const res = await resolveCw('Elden Ring', '123');
    expect(res).toMatchObject({ kind: 'hit', slug: 'elden-ring', stars: 5 });
  });

  it('match exacto único → hit con stars de la fila, sin descargar la ficha', async () => {
    vi.mocked(search).mockResolvedValue([row('Elden Ring', 'elden-ring', 5)]);
    const res = await resolveCw('Elden Ring', null);
    expect(res).toMatchObject({
      kind: 'hit',
      slug: 'elden-ring',
      approximate: false,
      stars: 5,
      app: null,
    });
    expect(getApp).not.toHaveBeenCalled();
  });

  it('con loadAppPage descarga la ficha del match', async () => {
    vi.mocked(search).mockResolvedValue([row('Elden Ring', 'elden-ring', 5)]);
    vi.mocked(getApp).mockResolvedValue(appPage(5));
    const res = await resolveCw('Elden Ring', null, { loadAppPage: true });
    expect(res.kind).toBe('hit');
    expect(getApp).toHaveBeenCalledWith('elden-ring', undefined);
  });

  it('varios candidatos sin claro ganador → ambiguous', async () => {
    vi.mocked(search).mockResolvedValue([
      row("Baldur's Gate 3", 'baldurs-gate-3'),
      row("Baldur's Gate II: Shadows of Amn", 'baldurs-gate-ii'),
    ]);
    const res = await resolveCw('Baldur', null);
    expect(res.kind).toBe('ambiguous');
    if (res.kind === 'ambiguous') expect(res.candidates.length).toBe(2);
  });

  it('forcePicker ignora la elección guardada y el auto-pick', async () => {
    vi.mocked(getSourceChoice).mockResolvedValue('elden-ring');
    vi.mocked(search).mockResolvedValue([
      row('Elden Ring', 'elden-ring', 5),
      row('ELDEN RING NIGHTREIGN', 'elden-ring-nightreign', 4),
    ]);
    const res = await resolveCw('Elden Ring', '123', { forcePicker: true });
    expect(getSourceChoice).not.toHaveBeenCalled();
    expect(res.kind).toBe('ambiguous');
  });

  it('sin resultados → none', async () => {
    const res = await resolveCw('Juego Inexistente', null);
    expect(res.kind).toBe('none');
  });
});
