# Chrome Web Store — Textos del listing

## Nombre

CrosTem — Mac compatibility for Steam

## Resumen corto (≤132 caracteres)

**EN:** See if a Steam game runs on your Mac — CrossOver ratings, AppleGamingWiki status and anticheat info, right on the store.

**ES:** Mira si un juego de Steam corre en tu Mac — ratings de CrossOver, AppleGamingWiki y anticheat, directamente en la tienda.

## Descripción (EN)

Wondering "will this run on my Mac?" every time you browse Steam? CrosTem answers it in place.

★ On every game page: a "Runs on Mac?" verdict (🟢🟡🔴) combining three community sources —
• CodeWeavers CrossOver ratings, with per-version stars (see how the latest CrossOver runs it)
• AppleGamingWiki: CrossOver / Parallels / Rosetta 2 status
• AreWeAntiCheatYet: anticheat support (the #1 blocker for multiplayer under CrossOver — Linux/Proton data, indicative)

★ Star overlays on game capsules across the whole store (front page, sales, categories), loaded lazily as you scroll.
★ Badges in search results and your wishlist.
★ Native Mac games get a "Native on macOS" badge — no lookups needed.
★ Wrong match? Pick the right game once; CrosTem remembers it (export/import included).
★ Toolbar popup to look up any game manually.
★ Fully configurable: enable/disable each surface and data source, set your CrossOver version, control the cache.
★ English and Spanish.

Privacy: no telemetry, no accounts, no servers. Everything stays in your browser; the extension only fetches public compatibility pages. See the privacy policy.

CrosTem is not affiliated with CodeWeavers, AppleGamingWiki, AreWeAntiCheatYet, Valve or Apple.

## Descripción (ES)

¿Te preguntas "¿esto correrá en mi Mac?" cada vez que miras Steam? CrosTem lo responde en el sitio.

★ En cada ficha: un veredicto "¿Corre en Mac?" (🟢🟡🔴) que combina tres fuentes comunitarias —
• Ratings de CrossOver de CodeWeavers, con estrellas por versión (mira cómo va con el último CrossOver)
• AppleGamingWiki: estado de CrossOver / Parallels / Rosetta 2
• AreWeAntiCheatYet: soporte del anticheat (el bloqueador nº1 del multijugador bajo CrossOver — datos de Linux/Proton, orientativos)

★ Estrellas sobre las cápsulas de toda la tienda (portada, ofertas, categorías), cargadas al hacer scroll.
★ Badges en la búsqueda y en tu wishlist.
★ Los juegos nativos de Mac muestran "Nativo en macOS" — sin consultas.
★ ¿Coincidencia errónea? Elige el juego correcto una vez; CrosTem lo recuerda (con export/import).
★ Popup en la barra para consultar cualquier juego a mano.
★ Totalmente configurable: activa/desactiva cada superficie y fuente, fija tu versión de CrossOver, controla la caché.
★ En inglés y español.

Privacidad: sin telemetría, sin cuentas, sin servidores. Todo queda en tu navegador; la extensión solo consulta páginas públicas de compatibilidad. Mira la política de privacidad.

CrosTem no está afiliada a CodeWeavers, AppleGamingWiki, AreWeAntiCheatYet, Valve ni Apple.

## Categoría

Productivity → Tools (o "Fun" → Entertainment; Tools recomendado)

## Single purpose (formulario de revisión)

**EN:** Display Mac gaming compatibility information (CrossOver ratings, AppleGamingWiki status, anticheat support) on Steam store pages.

## Justificación de permisos (formulario de revisión)

- `storage`: cache compatibility results locally and store user preferences.
- Host `store.steampowered.com` (content scripts): display compatibility info on the Steam store the user is browsing; read the game name/appid from the page; query Steam's public appdetails endpoint for the native-Mac flag.
- Host `www.codeweavers.com`: fetch public CrossOver compatibility pages.
- Host `www.applegamingwiki.com`: query the public MediaWiki cargo API for compatibility status.
- Host `raw.githubusercontent.com`: download AreWeAntiCheatYet's public games.json dataset.

## Assets

- Icono 128×128: `public/icons/icon128.png`
- Capturas 1280×800: `store-assets/` (generadas con `npm run listing`)
- Privacy policy URL: publicar `docs/privacy-policy.md` (+ `.es.md`) como GitHub Gist/Pages y pegar la URL.
