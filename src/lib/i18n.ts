// Helper de i18n. Los estados que reportan las fuentes ("Runs Great",
// "playable"…) NO se traducen — son citas de la fuente (decisión de producto);
// se traduce el chrome de la UI (etiquetas, veredictos, botones).

/** chrome.i18n.getMessage con fallback a la clave (útil en tests/harness). */
export function t(key: string, substitutions?: string | string[]): string {
  try {
    const msg = chrome.i18n.getMessage(key, substitutions);
    return msg || key;
  } catch {
    return key;
  }
}
