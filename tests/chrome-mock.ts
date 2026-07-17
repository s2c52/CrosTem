// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared chrome API stub for unit tests (generalizes the inline stub
// that i18n.test.ts used to carry). Installs a fake `chrome` global and
// returns handles to drive it: backing stores, storage-change emission,
// the captured onMessage listener and a configurable getBytesInUse.
import { vi } from 'vitest';

type Store = Record<string, unknown>;
type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type StorageListener = (changes: StorageChanges, area: string) => void;

export type MessageListener = (
  msg: unknown,
  sender: { id?: string },
  sendResponse: (res: unknown) => void,
) => boolean | undefined;

export const EXTENSION_ID = 'crostem-test-id';

export interface ChromeMock {
  /** Backing store of chrome.storage.local (mutate freely). */
  local: Store;
  /** Backing store of chrome.storage.sync. */
  sync: Store;
  /** Fires storage.onChanged listeners, simulating an external write. */
  emitStorageChange(changes: StorageChanges, area: 'local' | 'sync'): void;
  /** The runtime.onMessage listener captured at module load. */
  messageListener(): MessageListener;
  /** Calls made to storage.local.get so far (cache-hit assertions). */
  localGets(): number;
  /** Value returned by storage.local.getBytesInUse. */
  setBytesInUse(bytes: number): void;
  /** Makes the next `count` storage.local.set calls reject (quota tests). */
  failLocalSets(count: number): void;
}

export function stubChrome(init: { local?: Store; sync?: Store } = {}): ChromeMock {
  const local = init.local ?? {};
  const sync = init.sync ?? {};
  let bytesInUse = 0;
  let localGetCalls = 0;
  let failingSets = 0;
  const storageListeners: StorageListener[] = [];
  const messageListeners: MessageListener[] = [];

  function read(store: Store, keys: string | string[] | null | undefined): Store {
    if (keys === null || keys === undefined) return { ...store };
    const out: Store = {};
    for (const k of typeof keys === 'string' ? [keys] : keys) {
      if (k in store) out[k] = store[k];
    }
    return out;
  }

  function makeArea(store: Store, countGets: boolean) {
    return {
      get: (keys?: string | string[] | null) => {
        if (countGets) localGetCalls++;
        return Promise.resolve(read(store, keys));
      },
      set: (items: Store) => {
        if (countGets && failingSets > 0) {
          failingSets--;
          return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
        }
        Object.assign(store, items);
        return Promise.resolve();
      },
      remove: (keys: string | string[]) => {
        for (const k of typeof keys === 'string' ? [keys] : keys) delete store[k];
        return Promise.resolve();
      },
      getBytesInUse: () => Promise.resolve(bytesInUse),
    };
  }

  vi.stubGlobal('chrome', {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string) => path,
      onMessage: { addListener: (l: MessageListener) => void messageListeners.push(l) },
      onInstalled: { addListener: () => undefined },
    },
    tabs: { create: () => Promise.resolve() },
    storage: {
      local: makeArea(local, true),
      sync: makeArea(sync, false),
      onChanged: { addListener: (l: StorageListener) => void storageListeners.push(l) },
    },
  });

  return {
    local,
    sync,
    emitStorageChange: (changes, area) => storageListeners.forEach((l) => l(changes, area)),
    messageListener: () => {
      const listener = messageListeners[0];
      if (!listener) throw new Error('no onMessage listener registered');
      return listener;
    },
    localGets: () => localGetCalls,
    setBytesInUse: (bytes) => {
      bytesInUse = bytes;
    },
    failLocalSets: (count) => {
      failingSets = count;
    },
  };
}
