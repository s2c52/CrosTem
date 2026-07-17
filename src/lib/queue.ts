// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Generic fetch queue: caps concurrency and dedupes in-flight work by
// key. Shared by the service worker (external fetches) and the Steam
// appdetails client, which used to carry two hand-rolled copies.

export interface FetchQueue<T> {
  /** Enqueues `work` under `key`; concurrent calls for the same key share
   * one promise. The result is not cached: once settled, the key is free. */
  run(key: string, work: () => Promise<T>): Promise<T>;
}

export function createFetchQueue<T>(maxConcurrent: number): FetchQueue<T> {
  let active = 0;
  const pending: Array<() => void> = [];
  const inflight = new Map<string, Promise<T>>();

  function pump(): void {
    while (active < maxConcurrent && pending.length > 0) {
      const start = pending.shift();
      if (!start) break;
      start();
    }
  }

  function run(key: string, work: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = new Promise<T>((resolve, reject) => {
      pending.push(() => {
        active++;
        // Cleanup is chained BEFORE resolve/reject reach the caller:
        // otherwise an awaiter re-running the same key immediately would
        // still see the settled promise in `inflight` and get stale work.
        work()
          .finally(() => {
            active--;
            inflight.delete(key);
            pump();
          })
          .then(resolve, reject);
      });
      pump();
    });
    inflight.set(key, p);
    return p;
  }

  return { run };
}
