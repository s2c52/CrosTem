# Changelog

All notable changes to CrosTem are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

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
