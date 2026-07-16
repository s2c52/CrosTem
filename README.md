# CrosTem — Mac compatibility for Steam

Extensión de navegador (Manifest V3, Chromium) que muestra la compatibilidad de **CrossOver (macOS)** reportada en la base de datos de [CodeWeavers](https://www.codeweavers.com/compatibility) directamente en la tienda de Steam.

**Autor:** Sacha Gennari — [s2c52](https://github.com/s2c52) · **Licencia:** GPL-3.0

> Roadmap hacia la Chrome Web Store: ver [ROADMAP.md](ROADMAP.md).

## Qué hace

- **Ficha del juego** (`store.steampowered.com/app/*`): widget en la columna derecha con el rating Mac ("Runs Great"...), estrellas, última versión testeada y el desglose de las 3 últimas versiones de CrossOver (la rama 26.x se destaca en azul), con enlace a CodeWeavers.
- **Cápsulas de toda la tienda** (portada, ofertas, categorías, "más como esto"...): overlay de estrellas en la esquina de la imagen del juego, cargado automáticamente cuando la cápsula entra en pantalla (IntersectionObserver). `` = nativo, `?` = varias coincidencias posibles (enlaza a CodeWeavers), `~` = coincidencia aproximada. Las cápsulas sin datos no muestran nada.
- **Búsqueda y wishlist**: estrellas automáticas junto al título de cada fila al hacerse visible.
- **Juegos con macOS nativo**: badge verde "Native on macOS" sin consultar CodeWeavers (en cápsulas se detecta vía la API `appdetails` de Steam, mismo origen).
- **Matching dudoso**: si el nombre en Steam no coincide claramente con una sola entrada de CodeWeavers, el widget de la ficha muestra una lista de candidatos; tu elección se recuerda para ese juego ("Wrong match?" para cambiarla) y la respetan también los overlays.

## Desarrollo

```bash
npm install
npm run build      # typecheck + vite build → dist/
npm test           # tests unit (vitest, fixtures HTML reales)
npm run dev        # vite en modo watch (recarga la extensión al guardar)
```

**Cargar en Brave/Chrome:** `brave://extensions` → Developer mode → **Load unpacked** → seleccionar la carpeta **`dist/`** (generada por `npm run build`).

El gate de verificación del flujo higinio es `scripts/verify.sh` (typecheck + tests + build); CI en GitHub Actions ejecuta lo mismo en cada push.

## Cómo funciona

- CodeWeavers no tiene API pública: se consulta su web (`/compatibility?name=...` para buscar y `/compatibility/crossover/<slug>` para la ficha) y se parsea el HTML.
- El **service worker** (`src/background.ts`) hace los fetch (los content scripts no pueden por CORS), con máximo 2 peticiones simultáneas y deduplicación.
- El **content script** parsea con `DOMParser` (`src/lib/parser.ts`) y cachea los resultados parseados 7 días en `chrome.storage.local` (24 h para respuestas "sin datos"). Las elecciones de matching (`appid → slug`) son permanentes.
- Para las cápsulas sin nombre en el DOM se usa la API de Steam `appdetails` (mismo origen, `filters=platforms,basic`), que también da el flag de Mac nativo; se cachea 30 días y se limita a 2 peticiones simultáneas.

## Estructura

```
manifest.json            MV3: permisos y entradas (rutas src/*.ts; las compila crxjs)
vite.config.ts           Vite + @crxjs/vite-plugin
src/types.ts             Tipos de dominio y mensajería
src/background.ts        SW: fetch a codeweavers.com (cola + dedupe)
src/lib/parser.ts        Scraping del HTML de CodeWeavers (todo aquí)
src/lib/matcher.ts       Normalización de nombres y scoring de candidatos
src/lib/cache.ts         Caché con TTL + elecciones appid→slug
src/lib/client.ts        search()/getApp()/steamDetails(): fetch + parse + caché
src/lib/widget.ts        Construcción del widget de la ficha
src/lib/auto.ts          Resolución automática compartida (IntersectionObserver)
src/content/app.ts       Ficha del juego
src/content/capsules.ts  Overlay de estrellas en cápsulas de toda la tienda
src/content/search.ts    Resultados de búsqueda (MutationObserver para AJAX)
src/content/wishlist.ts  Wishlist (SPA de React, detección genérica de enlaces /app/)
src/styles.css           Estética Steam
tests/                   Vitest + fixtures HTML reales de CodeWeavers
```

## Si CodeWeavers cambia su HTML

Todo el scraping vive en `src/lib/parser.ts` (selectores: `#teTable-app` para búsqueda; `#appRating .os_Mac` y `#breakdown .breakdown-row` para la ficha). Los tests de `tests/parser.test.ts` fallarán con fixtures nuevos — el comentario de cabecera explica cómo recapturarlos.
