# CrosTem

Extensión para Brave (Manifest V3) que muestra la compatibilidad de **CrossOver (macOS)** reportada en la base de datos de [CodeWeavers](https://www.codeweavers.com/compatibility) directamente en la tienda de Steam.

**Autor:** Sacha Gennari — [s2c52](https://github.com/s2c52)

## Qué hace

- **Ficha del juego** (`store.steampowered.com/app/*`): widget en la columna derecha con el rating Mac ("Runs Great"...), estrellas, última versión testeada y el desglose de las 3 últimas versiones de CrossOver (la rama 26.x se destaca en azul), con enlace a CodeWeavers.
- **Cápsulas de toda la tienda** (portada, ofertas, categorías, "más como esto"...): overlay de estrellas en la esquina de la imagen del juego, cargado automáticamente cuando la cápsula entra en pantalla (IntersectionObserver). `` = nativo, `?` = varias coincidencias posibles (enlaza a CodeWeavers), `~` = coincidencia aproximada. Las cápsulas sin datos no muestran nada.
- **Búsqueda y wishlist**: estrellas automáticas junto al título de cada fila al hacerse visible.
- **Juegos con macOS nativo**: badge verde "Native on macOS" sin consultar CodeWeavers (en cápsulas se detecta vía la API `appdetails` de Steam, mismo origen).
- **Matching dudoso**: si el nombre en Steam no coincide claramente con una sola entrada de CodeWeavers, el widget de la ficha muestra una lista de candidatos; tu elección se recuerda para ese juego ("Wrong match?" para cambiarla) y la respetan también los overlays.

## Instalación (uso personal)

1. Abre `brave://extensions`.
2. Activa **Developer mode** (arriba a la derecha).
3. Pulsa **Load unpacked** y selecciona esta carpeta (`CrosTem/`).

## Cómo funciona

- CodeWeavers no tiene API pública: se consulta su web (`/compatibility?name=...` para buscar y `/compatibility/crossover/<slug>` para la ficha) y se parsea el HTML.
- El **service worker** (`background.js`) hace los fetch (los content scripts no pueden por CORS), con máximo 2 peticiones simultáneas y deduplicación.
- El **content script** parsea con `DOMParser` (`lib/parser.js`) y cachea los resultados parseados 7 días en `chrome.storage.local` (24 h para respuestas "sin datos"). Las elecciones de matching (`appid → slug`) son permanentes.
- Para las cápsulas sin nombre en el DOM se usa la API de Steam `appdetails` (mismo origen, `filters=platforms,basic`), que también da el flag de Mac nativo; se cachea 30 días y se limita a 2 peticiones simultáneas.

## Estructura

```
manifest.json          MV3: permisos y content scripts
background.js          SW: fetch a codeweavers.com (cola + dedupe)
lib/parser.js          Scraping del HTML de CodeWeavers (todo aquí)
lib/matcher.js         Normalización de nombres y scoring de candidatos
lib/cache.js           Caché con TTL + elecciones appid→slug
lib/client.js          search()/getApp()/steamDetails(): fetch + parse + caché
lib/widget.js          Construcción del widget de la ficha
lib/auto.js            Resolución automática compartida (IntersectionObserver)
content-app.js         Ficha del juego
content-capsules.js    Overlay de estrellas en cápsulas de toda la tienda
content-search.js      Resultados de búsqueda (MutationObserver para AJAX)
content-wishlist.js    Wishlist (SPA de React, detección genérica de enlaces /app/)
styles.css             Estética Steam
```

## Si CodeWeavers cambia su HTML

Todo el scraping vive en `lib/parser.js` (selectores: `#teTable-app` para búsqueda; `#appRating .os_Mac` y `#breakdown .breakdown-row` para la ficha). Si el widget muestra errores o datos vacíos, es el primer sitio donde mirar.
