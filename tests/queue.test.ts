// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { createFetchQueue } from '../src/lib/queue';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createFetchQueue', () => {
  it('dedupe: llamadas concurrentes con la misma clave comparten promesa', async () => {
    const queue = createFetchQueue<string>(2);
    const d = deferred<string>();
    let calls = 0;
    const work = () => {
      calls++;
      return d.promise;
    };
    const p1 = queue.run('k', work);
    const p2 = queue.run('k', work);
    expect(p1).toBe(p2);
    d.resolve('value');
    await expect(p1).resolves.toBe('value');
    expect(calls).toBe(1);
  });

  it('libera la clave al asentarse: la siguiente llamada vuelve a trabajar', async () => {
    const queue = createFetchQueue<string>(2);
    let calls = 0;
    const result = await queue.run('k', () => {
      calls++;
      return Promise.resolve('one');
    });
    expect(result).toBe('one');
    await queue.run('k', () => {
      calls++;
      return Promise.resolve('two');
    });
    expect(calls).toBe(2);
  });

  it('limita la concurrencia al máximo configurado', async () => {
    const queue = createFetchQueue<string>(2);
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const d3 = deferred<string>();
    const started: string[] = [];
    const run = (key: string, d: { promise: Promise<string> }) =>
      queue.run(key, () => {
        started.push(key);
        return d.promise;
      });
    const p1 = run('a', d1);
    const p2 = run('b', d2);
    const p3 = run('c', d3);
    await tick();
    expect(started).toEqual(['a', 'b']);
    d1.resolve('a');
    await tick();
    expect(started).toEqual(['a', 'b', 'c']);
    d2.resolve('b');
    d3.resolve('c');
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual(['a', 'b', 'c']);
  });

  it('un rechazo libera el slot y propaga el error', async () => {
    const queue = createFetchQueue<string>(1);
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const started: string[] = [];
    const p1 = queue.run('a', () => {
      started.push('a');
      return d1.promise;
    });
    const p2 = queue.run('b', () => {
      started.push('b');
      return d2.promise;
    });
    await tick();
    expect(started).toEqual(['a']);
    d1.reject(new Error('boom'));
    await expect(p1).rejects.toThrow('boom');
    await tick();
    expect(started).toEqual(['a', 'b']);
    d2.resolve('b');
    await expect(p2).resolves.toBe('b');
  });
});
