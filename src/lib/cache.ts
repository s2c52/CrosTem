// Caché en chrome.storage.local con TTL, más el mapa persistente de
// coincidencias confirmadas por el usuario (steam appid -> slug CodeWeavers).

export const TTL_RESULT = 7 * 24 * 60 * 60 * 1000; // páginas/búsquedas parseadas: 7 días
export const TTL_NEGATIVE = 24 * 60 * 60 * 1000; // respuestas "sin datos": 24 horas

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

/** Invalida entradas concretas (botón refresh del widget). */
export async function remove(...keys: string[]): Promise<void> {
  await chrome.storage.local.remove(keys.map((k) => 'cache:' + k));
}

// Correcciones de matching confirmadas por el usuario, por fuente de datos
// ('cw' → slug de CodeWeavers, 'agw' → página de AppleGamingWiki).
export type MatchSource = 'cw' | 'agw';

export async function getSourceChoice(source: MatchSource, appid: string): Promise<string | undefined> {
  const v = await storageGet<string>(`choice:${source}:${appid}`);
  if (v !== undefined) return v;
  // Clave heredada de v0.2/v0.3 (solo existía la elección de CodeWeavers).
  if (source === 'cw') return storageGet<string>('choice:' + appid);
  return undefined;
}

export async function setSourceChoice(source: MatchSource, appid: string, value: string): Promise<void> {
  await chrome.storage.local.set({ [`choice:${source}:${appid}`]: value });
}

export async function clearSourceChoice(source: MatchSource, appid: string): Promise<void> {
  await chrome.storage.local.remove(`choice:${source}:${appid}`);
  if (source === 'cw') await chrome.storage.local.remove('choice:' + appid);
}
