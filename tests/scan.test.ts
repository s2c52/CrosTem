// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it } from 'vitest';
import { createIncrementalScanner, type ScannerHandle } from '../src/lib/scan';

const DELAY = 10;

function tick(ms = 40): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let scanner: ScannerHandle | null = null;

afterEach(() => {
  scanner?.stop();
  scanner = null;
  document.body.innerHTML = '';
});

describe('createIncrementalScanner', () => {
  it('hace un full scan al arrancar y scans acotados a lo añadido', async () => {
    const calls: Array<readonly Element[] | null> = [];
    scanner = createIncrementalScanner((roots) => calls.push(roots), DELAY);
    scanner.start(document.body);
    expect(calls).toEqual([null]);

    const div = document.createElement('div');
    document.body.appendChild(div);
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([div]);
  });

  it('ignora los nodos inyectados por la propia extensión', async () => {
    const calls: Array<readonly Element[] | null> = [];
    scanner = createIncrementalScanner((roots) => calls.push(roots), DELAY);
    scanner.start(document.body);

    const badge = document.createElement('span');
    badge.className = 'crostem-badge';
    document.body.appendChild(badge);
    await tick();
    expect(calls).toHaveLength(1); // only the initial full scan
  });

  it('desborda a full scan con demasiadas raíces pendientes', async () => {
    const calls: Array<readonly Element[] | null> = [];
    scanner = createIncrementalScanner((roots) => calls.push(roots), DELAY);
    scanner.start(document.body);

    for (let i = 0; i < 70; i++) document.body.appendChild(document.createElement('div'));
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeNull();
  });

  it('descarta raíces ya desconectadas y omite flushes vacíos', async () => {
    const calls: Array<readonly Element[] | null> = [];
    scanner = createIncrementalScanner((roots) => calls.push(roots), DELAY);
    scanner.start(document.body);

    const div = document.createElement('div');
    document.body.appendChild(div);
    div.remove();
    await tick();
    expect(calls).toHaveLength(1); // nothing connected left to scan
  });

  it('stop() corta la observación y el trabajo pendiente', async () => {
    const calls: Array<readonly Element[] | null> = [];
    scanner = createIncrementalScanner((roots) => calls.push(roots), DELAY);
    scanner.start(document.body);
    document.body.appendChild(document.createElement('div'));
    scanner.stop();
    await tick();
    expect(calls).toHaveLength(1);
  });
});
