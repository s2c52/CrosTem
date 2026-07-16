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

export async function getSlugChoice(appid: string): Promise<string | undefined> {
  return storageGet<string>('choice:' + appid);
}

export async function setSlugChoice(appid: string, slug: string): Promise<void> {
  await chrome.storage.local.set({ ['choice:' + appid]: slug });
}

export async function clearSlugChoice(appid: string): Promise<void> {
  await chrome.storage.local.remove('choice:' + appid);
}
