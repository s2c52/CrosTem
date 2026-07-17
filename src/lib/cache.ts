// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Cache in chrome.storage.local with TTL, plus the persistent map of
// user-confirmed matches (steam appid -> CodeWeavers slug).

import { getSettings } from './settings';

export const TTL_RESULT = 7 * 24 * 60 * 60 * 1000; // fallback when there are no settings
export const TTL_NEGATIVE = 24 * 60 * 60 * 1000; // "no data" responses: 24 hours

/** Result TTL according to the user's settings (days → ms). */
export async function ttlResult(): Promise<number> {
  try {
    return (await getSettings()).cacheTtlDays * 24 * 60 * 60 * 1000;
  } catch {
    return TTL_RESULT;
  }
}

interface CacheEntry<T> {
  value: T;
  expires: number;
}

async function storageGet<T>(key: string): Promise<T | undefined> {
  const obj = await chrome.storage.local.get(key);
  return obj[key] as T | undefined;
}

export async function get<T>(key: string): Promise<T | undefined> {
  const entry = await storageGet<CacheEntry<T>>('cache:' + key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    void chrome.storage.local.remove('cache:' + key);
    return undefined;
  }
  return entry.value;
}

export async function set<T>(key: string, value: T, ttlMs: number = TTL_RESULT): Promise<void> {
  const entry: CacheEntry<T> = { value, expires: Date.now() + ttlMs };
  await chrome.storage.local.set({ ['cache:' + key]: entry });
}

/** Invalidates specific entries (widget refresh button). */
export async function remove(...keys: string[]): Promise<void> {
  await chrome.storage.local.remove(keys.map((k) => 'cache:' + k));
}

/** Keys in chrome.storage.local starting with the given prefix. */
export async function storageKeys(prefix: string): Promise<string[]> {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith(prefix));
}

// User-confirmed matching corrections, per data source
// ('cw' → CodeWeavers slug, 'agw' → AppleGamingWiki page).
export type MatchSource = 'cw' | 'agw';

export async function getSourceChoice(
  source: MatchSource,
  appid: string,
): Promise<string | undefined> {
  const v = await storageGet<string>(`choice:${source}:${appid}`);
  if (v !== undefined) return v;
  // Legacy key from v0.2/v0.3 (only the CodeWeavers choice existed).
  if (source === 'cw') return storageGet<string>('choice:' + appid);
  return undefined;
}

export async function setSourceChoice(
  source: MatchSource,
  appid: string,
  value: string,
): Promise<void> {
  await chrome.storage.local.set({ [`choice:${source}:${appid}`]: value });
}

export async function clearSourceChoice(source: MatchSource, appid: string): Promise<void> {
  await chrome.storage.local.remove(`choice:${source}:${appid}`);
  if (source === 'cw') await chrome.storage.local.remove('choice:' + appid);
}
