# CrosTem — Política de privacidad

_Última actualización: 2026-07-16_

CrosTem ("la extensión") muestra información de compatibilidad con Mac mientras navegas por la tienda de Steam. La desarrolla Sacha Gennari (s2c52).

## La versión corta

CrosTem **no recopila ningún dato personal**. No hay telemetría, ni analítica, ni cuentas, y ningún dato sale de tu navegador salvo las peticiones anónimas necesarias para consultar la compatibilidad de los juegos.

## Qué hace la extensión con los datos

- **Sin recopilación.** La extensión no tiene servidores. Nada de lo que haces se registra, transmite ni vende — ni a nosotros ni a nadie.
- **Solo almacenamiento local.** Los resultados de compatibilidad se cachean en el almacenamiento de la extensión (`chrome.storage.local`) para no repetir peticiones. Tus preferencias (superficies/fuentes activas, tu versión de CrossOver, duración de la caché) se guardan en `chrome.storage.sync`, que tu navegador puede sincronizar con tu propia cuenta. Puedes borrar ambos en cualquier momento desde la página de ajustes.
- **Correcciones de matching.** Si corriges una coincidencia errónea, esa elección (appid de Steam → entrada de la base de datos) se guarda localmente. La exportación escribe un archivo en tu equipo; no se sube nada.

## Peticiones de red que hace la extensión

Para consultar la compatibilidad de un juego, la extensión pide páginas/APIs públicas de estos servicios, enviando solo el nombre del juego o su appid público de Steam:

| Servicio                                        | Propósito                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `www.codeweavers.com`                           | Ratings de compatibilidad de CrossOver                                     |
| `www.applegamingwiki.com`                       | Estado de CrossOver/Parallels/Rosetta 2                                    |
| `raw.githubusercontent.com` (AreWeAntiCheatYet) | Estado del soporte de anticheat                                            |
| `store.steampowered.com`                        | Nombre del juego y flag de Mac nativo (el mismo sitio que estás navegando) |

Estas peticiones no llevan identificadores de la extensión más allá de lo que incluye cualquier petición del navegador. A lo que cada servicio registre en su servidor se le aplica su propia política de privacidad. Los resultados se cachean (7 días por defecto) para minimizar las peticiones.

## Permisos

- **`storage`** — para cachear resultados y guardar tus preferencias localmente.
- **Acceso a los servicios listados arriba** — únicamente para obtener datos de compatibilidad. La extensión se ejecuta en páginas de `store.steampowered.com` para mostrar la información en su sitio.

## Afiliación

CrosTem no está afiliada, respaldada ni patrocinada por CodeWeavers, AppleGamingWiki, AreWeAntiCheatYet, Valve/Steam ni Apple. Las marcas pertenecen a sus dueños.

## Cambios y contacto

Los cambios en esta política se reflejarán en esta página con nueva fecha. Dudas: abre un issue en el repositorio del proyecto o contacta con el desarrollador.
