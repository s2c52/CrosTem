// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

/** Throws if the value is null/undefined; returns it narrowed otherwise. */
export function must<T>(v: T | null | undefined, what = 'value'): T {
  if (v == null) throw new Error(`expected ${what} to be present`);
  return v;
}
