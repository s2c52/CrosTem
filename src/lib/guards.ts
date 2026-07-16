// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Runtime type guards for data crossing trust boundaries
// (external JSON responses, extension messages).
import type { ExtFetchRequest } from '../types';

/** Narrows an unknown value to a plain object with string keys. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns the value if it is a string, undefined otherwise. */
export function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Runtime validation of an incoming extFetch message (untrusted). */
export function isExtFetchRequest(msg: unknown): msg is ExtFetchRequest {
  return isRecord(msg) && msg.type === 'extFetch' && typeof msg.url === 'string';
}
