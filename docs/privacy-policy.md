# CrosTem — Privacy Policy

_Last updated: 2026-07-16_

CrosTem ("the extension") shows Mac compatibility information for games while you browse the Steam store. It is developed by Sacha Gennari (s2c52).

## The short version

CrosTem collects **no personal data whatsoever**. There is no telemetry, no analytics, no accounts, and no data ever leaves your browser except the anonymous requests needed to look up game compatibility.

## What the extension does with data

- **No collection.** The extension has no servers. Nothing you do is recorded, transmitted or sold — to us or to anyone.
- **Local storage only.** Compatibility results are cached in your browser's extension storage (`chrome.storage.local`) to avoid repeating requests. Your preferences (which surfaces/sources are enabled, your CrossOver version, cache duration) are stored in `chrome.storage.sync`, which your browser may sync with your own browser account. You can clear both at any time from the extension's settings page.
- **Match corrections.** If you correct a wrong game match, that choice (Steam app id → database entry) is stored locally. The export feature writes them to a file on your device; nothing is uploaded.

## Network requests the extension makes

To look up a game's compatibility, the extension requests public pages/APIs of these services, sending only the game's name or public Steam app id:

| Service                                         | Purpose                                                    |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `www.codeweavers.com`                           | CrossOver compatibility ratings                            |
| `www.applegamingwiki.com`                       | CrossOver/Parallels/Rosetta 2 status                       |
| `raw.githubusercontent.com` (AreWeAntiCheatYet) | Anticheat support status                                   |
| `store.steampowered.com`                        | Game name and native-Mac flag (same site you are browsing) |

These requests carry no identifiers from the extension beyond what any browser request includes. Each service's own privacy policy applies to what they log server-side. Results are cached (default 7 days) to keep requests to a minimum.

## Permissions

- **`storage`** — to cache results and save your preferences locally.
- **Host access to the services listed above** — solely to fetch compatibility data. The extension runs on `store.steampowered.com` pages to display the information in place.

## Affiliation

CrosTem is not affiliated with, endorsed by, or sponsored by CodeWeavers, AppleGamingWiki, AreWeAntiCheatYet, Valve/Steam, or Apple. All trademarks belong to their owners.

## Changes and contact

Changes to this policy will be reflected on this page with a new date. Questions: open an issue on the project repository or contact the developer.
