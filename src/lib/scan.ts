// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Incremental DOM scanning shared by the store-surface content scripts.
// A MutationObserver collects the roots of added subtrees; a coalesced
// flush scans only those (falling back to one full scan when the batch
// overflows), so busy SPA pages stop paying a full-document
// querySelectorAll on every mutation burst.
import { coalesce } from './debounce';

/** Above this many pending roots one full scan beats tracking them. */
const MAX_PENDING_ROOTS = 64;

export interface ScannerHandle {
  /** Runs one full scan and starts observing `target` for additions. */
  start(target: Node): void;
  /** Stops observing and drops any pending work. */
  stop(): void;
}

/**
 * `scan` receives the added element roots, or null for a full-document
 * pass (initial scan and batch overflow). Roots are pre-filtered to
 * connected elements; the extension's own injected nodes never trigger
 * a rescan.
 */
export function createIncrementalScanner(
  scan: (roots: readonly Element[] | null) => void,
  delayMs: number,
): ScannerHandle {
  const pending = new Set<Element>();
  let full = false;
  let active = false;

  const flush = coalesce(() => {
    if (!active) return;
    const roots = full ? null : [...pending].filter((el) => el.isConnected);
    full = false;
    pending.clear();
    if (roots !== null && roots.length === 0) return;
    scan(roots);
  }, delayMs);

  const observer = new MutationObserver((mutations) => {
    let relevant = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        // Our own badges/overlays churn the DOM too; never rescan for them.
        if (el.classList.contains('crostem-badge') || el.classList.contains('crostem-overlay')) {
          continue;
        }
        relevant = true;
        if (!full) {
          pending.add(el);
          if (pending.size > MAX_PENDING_ROOTS) {
            full = true;
            pending.clear();
          }
        }
      }
    }
    if (relevant) flush();
  });

  return {
    start(target) {
      active = true;
      full = false;
      pending.clear();
      scan(null);
      observer.observe(target, { childList: true, subtree: true });
    },
    stop() {
      active = false;
      observer.disconnect();
      pending.clear();
      full = false;
    },
  };
}
