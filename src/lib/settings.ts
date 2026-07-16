// Configuración de usuario. Se guarda en chrome.storage.sync (viaja con la
// cuenta del navegador); los content scripts la leen una vez al arrancar —
// los cambios piden recargar las pestañas de Steam.

export interface Settings {
  surfaces: {
    app: boolean;      // widget en la ficha del juego
    capsules: boolean; // overlays sobre cápsulas
    search: boolean;   // badges en resultados de búsqueda
    wishlist: boolean; // badges en la wishlist
  };
  sources: {
    cw: boolean;        // CodeWeavers
    agw: boolean;       // AppleGamingWiki
    anticheat: boolean; // AreWeAntiCheatYet
  };
  /** Rama de CrossOver del usuario (se destaca en el widget), ej. "26". */
  crossoverVersion: string;
  /** TTL de la caché de resultados, en días (1-30). */
  cacheTtlDays: number;
}

export const DEFAULTS: Settings = {
  surfaces: { app: true, capsules: true, search: true, wishlist: true },
  sources: { cw: true, agw: true, anticheat: true },
  crossoverVersion: '26',
  cacheTtlDays: 7,
};

const KEY = 'settings';

/** Mezcla lo guardado con los defaults (campos nuevos quedan cubiertos). */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored ?? {}) as Partial<Settings>;
  return {
    surfaces: { ...DEFAULTS.surfaces, ...(s.surfaces ?? {}) },
    sources: { ...DEFAULTS.sources, ...(s.sources ?? {}) },
    crossoverVersion: typeof s.crossoverVersion === 'string' && s.crossoverVersion.trim()
      ? s.crossoverVersion.trim()
      : DEFAULTS.crossoverVersion,
    cacheTtlDays: typeof s.cacheTtlDays === 'number' && s.cacheTtlDays >= 1 && s.cacheTtlDays <= 30
      ? Math.round(s.cacheTtlDays)
      : DEFAULTS.cacheTtlDays,
  };
}

let cached: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cached) return cached;
  const obj = await chrome.storage.sync.get(KEY);
  cached = mergeSettings(obj[KEY]);
  return cached;
}

export async function saveSettings(settings: Settings): Promise<void> {
  cached = settings;
  await chrome.storage.sync.set({ [KEY]: settings });
}
