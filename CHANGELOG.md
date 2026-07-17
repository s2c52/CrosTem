# Changelog

All notable changes to CrosTem are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

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
