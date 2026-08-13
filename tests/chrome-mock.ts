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
  /** Calls made to storage.local.set so far (write-coalescing assertions). */
  localSets(): number;
  /** Calls made to storage.sync.get so far (single-flight assertions). */
  syncGets(): number;
  /** Value returned by storage.local.getBytesInUse. */
  setBytesInUse(bytes: number): void;
  /** Makes the next `count` storage.local.set calls reject (quota tests). */
  failLocalSets(count: number): void;
  /** Handler for runtime.sendMessage: return value goes to the callback. */
  onSendMessage(handler: (msg: unknown) => unknown): void;
}

export function stubChrome(init: { local?: Store; sync?: Store } = {}): ChromeMock {
  const local = init.local ?? {};
  const sync = init.sync ?? {};
  let bytesInUse = 0;
  let localGetCalls = 0;
  let localSetCalls = 0;
  let syncGetCalls = 0;
  let failingSets = 0;
  let sendMessageHandler: (msg: unknown) => unknown = () => ({
    ok: false,
    error: 'no sendMessage handler configured',
    code: 'network',
  });
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

  function makeArea(store: Store, area: 'local' | 'sync') {
    const emit = (changes: StorageChanges) => {
      if (Object.keys(changes).length > 0) storageListeners.forEach((l) => l(changes, area));
    };
    return {
      get: (keys?: string | string[] | null) => {
        if (area === 'local') localGetCalls++;
        else syncGetCalls++;
        return Promise.resolve(read(store, keys));
      },
      // Like real Chrome, set/remove fire onChanged in every context —
      // including the writer's own (own-write handling gets exercised).
      set: (items: Store) => {
        if (area === 'local') {
          localSetCalls++;
          if (failingSets > 0) {
            failingSets--;
            return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
          }
        }
        const changes: StorageChanges = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = k in store ? { oldValue: store[k], newValue: v } : { newValue: v };
        }
        Object.assign(store, items);
        emit(changes);
        return Promise.resolve();
      },
      remove: (keys: string | string[]) => {
        const changes: StorageChanges = {};
        for (const k of typeof keys === 'string' ? [keys] : keys) {
          if (k in store) {
            changes[k] = { oldValue: store[k] };
            delete store[k];
          }
        }
        emit(changes);
        return Promise.resolve();
      },
      getBytesInUse: () => Promise.resolve(bytesInUse),
      // Chrome 130+ API; tests can `delete` it to exercise fallbacks.
      getKeys: () => Promise.resolve(Object.keys(store)),
    };
  }

  vi.stubGlobal('chrome', {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string) => path,
      sendMessage: (msg: unknown, cb: (res: unknown) => void) => cb(sendMessageHandler(msg)),
      onMessage: { addListener: (l: MessageListener) => void messageListeners.push(l) },
      onInstalled: { addListener: () => undefined },
    },
    tabs: { create: () => Promise.resolve() },
    storage: {
      local: makeArea(local, 'local'),
      sync: makeArea(sync, 'sync'),
      onChanged: {
        addListener: (l: StorageListener) => void storageListeners.push(l),
        removeListener: (l: StorageListener) => {
          const at = storageListeners.indexOf(l);
          if (at >= 0) storageListeners.splice(at, 1);
        },
      },
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
    localSets: () => localSetCalls,
    syncGets: () => syncGetCalls,
    setBytesInUse: (bytes) => {
      bytesInUse = bytes;
    },
    failLocalSets: (count) => {
      failingSets = count;
    },
    onSendMessage: (handler) => {
      sendMessageHandler = handler;
    },
  };
}
