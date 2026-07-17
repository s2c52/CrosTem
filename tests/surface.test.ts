// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// watchSurface: initial mount by settings, live mount/unmount on
// storage.onChanged, and dedupe of repeated states. Modules are
// re-imported per test (settings memoizes per context).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubChrome, type ChromeMock } from './chrome-mock';

let mock: ChromeMock;

beforeEach(() => {
  vi.resetModules();
  mock = stubChrome();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeController() {
  return { start: vi.fn(), stop: vi.fn() };
}

async function watch(key: 'search' | 'capsules', controller: ReturnType<typeof makeController>) {
  const { watchSurface } = await import('../src/lib/surface');
  await watchSurface(key, controller);
}

function emitSettings(surfaces: Record<string, boolean>): void {
  mock.emitStorageChange({ settings: { newValue: { surfaces } } }, 'sync');
}

describe('watchSurface', () => {
  it('monta al inicio cuando la superficie está activa (default)', async () => {
    const c = makeController();
    await watch('search', c);
    expect(c.start).toHaveBeenCalledTimes(1);
    expect(c.stop).not.toHaveBeenCalled();
  });

  it('no monta cuando la superficie está desactivada', async () => {
    mock.sync['settings'] = { surfaces: { search: false } };
    const c = makeController();
    await watch('search', c);
    expect(c.start).not.toHaveBeenCalled();
    expect(c.stop).not.toHaveBeenCalled();
  });

  it('monta y desmonta en vivo al cambiar settings', async () => {
    mock.sync['settings'] = { surfaces: { capsules: false } };
    const c = makeController();
    await watch('capsules', c);

    emitSettings({ capsules: true });
    expect(c.start).toHaveBeenCalledTimes(1);

    emitSettings({ capsules: false });
    expect(c.stop).toHaveBeenCalledTimes(1);
  });

  it('deduplica estados repetidos', async () => {
    const c = makeController();
    await watch('search', c);
    emitSettings({ search: true });
    emitSettings({ search: true });
    expect(c.start).toHaveBeenCalledTimes(1);
    expect(c.stop).not.toHaveBeenCalled();
  });
});
