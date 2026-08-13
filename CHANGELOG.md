# Changelog

All notable changes to CrosTem are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.4.0] — 2026-08-13

### Added

- Badges paint instantly on pages you have visited before: resolutions feed a compact per-game verdict index (`verdict:index`, a few bytes per game), and list surfaces paint the remembered color the moment a tile appears, refining it in place when the live resolution lands. Unknown or failed outcomes are never primed — an appearing dot reads as an answer arriving, a gray dot flipping color would read as a wrong answer corrected — and a resolution that comes back empty un-primes the game. "Clear cached results" in the options resets the index too.

### Changed

- The AreWeAntiCheatYet index is cached in a compact form: 315 KB down to 165 KB for the current dataset. It is keyed by appid, by name and by edition-stripped name, and JSON has no shared references — so an entry reachable all three ways was written to storage three times. The maps now hold positions into a single list. Every page that consults anticheat data reads that index, so this is a saving on each of them, not just on disk. Indexes cached by earlier versions are refetched once.
- Cache writes coalesce: entries produced within a 150 ms window land in ONE `storage.local.set` (one quota check, one change event) instead of the 30–90 individual writes a cold store page used to fire, and same-tick cache reads share one `storage.local.get`. The in-memory L1 no longer evicts itself on its own writes (every write used to guarantee a miss on the next read of that key), and a removal or a foreign write drops any still-pending write so nothing cleared can be resurrected by a late flush.
- The cache counters in the popup and options list key names via `getKeys` (Chrome 130+, with the old full-read fallback) instead of materializing the whole multi-megabyte store to count entries, and the daily maintenance sweeps and evicts from one storage snapshot instead of two consecutive full reads.
- The AreWeAntiCheatYet download is single-flight: concurrent cold badges share one ~460 KB fetch, one parse and one index write instead of one each. CodeWeavers search and app-page lookups dedupe the same way, settings reads share one `storage.sync` round-trip, and the locale dictionary is fetched and compiled once when several surfaces initialize together on the same page.
- Name matching hoists its constant edition-suffix table: `baseName` no longer re-normalizes all 16 qualifiers on every call (it runs per badge and twice per game while indexing the anticheat dataset).
- Capsule overlays: the hover-card migration pass now runs only when a mutation actually touches hover-card markup, and the covered-overlay suppression reads all geometry before toggling any class and skips repeated passes over an unmoved card — pointer movement near a 100-capsule page stops forcing layout per overlay.
- Search results reuse the shared incremental scanner: only newly added rows are scanned (the old observer re-queried every row of the growing container and woke itself on our own badge insertions).
- Turning a surface off mid-resolution now cancels the in-flight work: the game-page widget no longer keeps resolving into its detached container after the toggle.
- Library scans decide their politeness spacing by whether a resolution actually dispatched a fetch, not by how fast it finished — a fast CDN answer no longer skips the spacing, and warm cached rescans no longer pay it.
- AppleGamingWiki page lookups now honor the "Cache results" days setting (they were pinned to the 7-day default).
- The release zip no longer ships source maps (they were ~40% of the package and every `.js.map` was listed as a web-accessible resource — stable fingerprinting URLs). Development builds keep maps, and any tagged release can be rebuilt locally with them to diagnose a report.

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
