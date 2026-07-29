# Changelog

All notable changes to CrosTem are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.3.0] — 2026-07-28

### Added

- Compatibility badges on your Steam Community games list (`steamcommunity.com/id/<user>/games`), so an owned library shows the CrossOver verdict next to each title — including the "Native on macOS" badge with its Apple Silicon / Intel tag. Works on any profile's list and on every tab (All Games, Recently Played, Perfect Games…), and can be turned off with the new "Library badges" switch in the popup and options.

## [1.2.1] — 2026-07-25

### Fixed

- AppleGamingWiki pages that omit the game's subtitle (e.g. "The Witcher 3" for "The Witcher 3: Wild Hunt") are now reachable: the lookup also searches by the pre-subtitle prefix and offers the pages in the candidate picker.
- Duplicate AppleGamingWiki table rows no longer cancel a confident match (NieR: Automata showed "No data" despite its perfect rating).
- Roman and arabic numerals are treated as the same name when scoring matches ("Original Sin II" ≡ "Original Sin 2"); this also fixes the native-badge architecture for Divinity: Original Sin 2 — Definitive Edition, which fell back to a release-date guess instead of AppleGamingWiki's Apple Silicon data.
- Anticheat warnings now reach store edition variants that lack their own AreWeAntiCheatYet entry: Grand Theft Auto V Enhanced shows the Denied (BattlEye) status filed under "Grand Theft Auto V", and its verdict drops to red accordingly.
- A lone below-confident AppleGamingWiki candidate no longer auto-matches when its page name is shorter than the game's, so a sequel can never inherit its prequel's page (Kingdom Come: Deliverance II vs "Kingdom Come: Deliverance"); those cases go to the candidate picker instead.

## [1.2.0] — 2026-07-18

### Added

- AreWeAntiCheatYet per-game notes surfaced on the game-page widget.
- About card with author credit on the options page.
- Wishlist stars validated against Steam's live React wishlist.

## [1.1.1] — 2026-07-17

### Fixed

- Points Shop items (emoticons, backgrounds, animated stickers) no longer get a compatibility star overlay on app pages or in the Points Shop — they aren't games.

## [1.1.0] — 2026-07-17

### Added

- Live settings apply: toggling a surface in the popup or options now mounts/unmounts it immediately on open Steam tabs, no reload needed.
- Stale-while-revalidate cache: previously seen games paint instantly (even past their cache TTL) and refresh silently in the background.
- Per-origin circuit breakers, per-source fetch timeouts and retries with backoff/Retry-After: a slow or downed data source degrades fast instead of hanging badges.
- Explicit content security policy for extension pages.

### Changed

- Badges resolve ahead of scrolling (~1 viewport of lookahead) and paint on the first source signal, refining when the rest arrive.
- Fetch concurrency raised from 2 to 4 lanes, halving cold resolution on busy pages.
- A CodeWeavers failure now degrades the badge to the AppleGamingWiki/anticheat verdict instead of discarding it.
- Content scripts scan only newly added page content instead of the whole document on every change; hover handling no longer forces layout work while the pointer moves.
- Cache upkeep: daily sweep of expired entries, quota-safe writes and size-capped eviction.
- Packaged builds are minified; store zip is ~207 KB.

## [1.0.2] — 2026-07-17

### Added

- Support for all 30 Steam languages; the UI follows the Steam page language, with a language setting (Auto by default).
- Welcome page on install.
- AppleGamingWiki candidate picker on the widget, with saved per-game corrections.
- Verdict banner on the widget with a collapsible one-line source breakdown.

### Changed

- Full UI/UX redesign: popup (active-tab mini-widget, toggles, status, keyboard navigation), options page (card layout, animated switches, apply-now bar), capsule badges (pill overlays with blur and rich tooltips) and shared design tokens.
- Accessibility pass: accessible ratings and verdict text, focus management and reduced-motion support.
- Shared verdict resolution pipeline extracted and reused across surfaces.
- Hardened MV3 internals: typed and validated content-script/service-worker messages, tightened security boundaries, robust external fetches and settings across service-worker restarts.

### Fixed

- Capsule hover cards: handle the hashed hover-card variant, hide overlays covered by the card, and inline the badge below the price in expanded cards.

## [1.0.1] — 2026-07-16

### Added

- Native binary architecture detection (Intel / Apple Silicon) on the game-page widget.
- 5-star rating scale.

### Changed

- Entire codebase (comments and docs) translated to English.

## [1.0.0] — 2026-07-16

Initial release.

- Game-page widget with the CrossOver (macOS) rating, stars, last tested version and a breakdown of the 3 latest CrossOver versions, linked to CodeWeavers.
- Star overlays on store capsules everywhere (front page, deals, categories…), loaded lazily via IntersectionObserver.
- Automatic stars on search results and wishlist rows.
- "Native on macOS" badge via Steam's `appdetails` API.
- Ambiguous-match resolution with remembered per-game choices.
- Anti-cheat status from Are We Anti-Cheat Yet? and complementary data from AppleGamingWiki.
- Local caching in `chrome.storage.local` (7 days for results, 24 h for "no data", 30 days for Steam details).
- Localized UI (English default locale, Spanish available).
