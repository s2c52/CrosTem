// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Timing helpers shared by the content scripts and the popup.

/** Coalesces a burst of calls: the first call schedules `fn` after
 * `delayMs`; calls arriving until it fires are ignored. Unlike a
 * trailing debounce this guarantees periodic runs under constant churn
 * (MutationObserver on busy SPA pages). */
export function coalesce(fn: () => void, delayMs: number): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      fn();
    }, delayMs);
  };
}

/** Trailing-edge debounce: runs `fn` once, `delayMs` after the last call
 * (search-as-you-type). */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
