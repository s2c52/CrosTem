// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Minimal gated logger. Content scripts run inside Steam pages, so
// production builds stay silent; `vite dev` builds log with a prefix.
// Use logWarn for failures worth investigating, logDebug for expected
// degradations (a source being down, cache fallbacks).

const DEBUG: boolean = import.meta.env.DEV;

export function logDebug(context: string, detail?: unknown): void {
  if (!DEBUG) return;
  if (detail === undefined) console.debug('[CrosTem]', context);
  else console.debug('[CrosTem]', context, detail);
}

export function logWarn(context: string, detail?: unknown): void {
  if (!DEBUG) return;
  if (detail === undefined) console.warn('[CrosTem]', context);
  else console.warn('[CrosTem]', context, detail);
}
