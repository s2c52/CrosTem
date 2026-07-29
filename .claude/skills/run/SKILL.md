---
name: run
description: Launch and drive the CrosTem browser extension in headless Chromium against real Steam pages — build dist, load the extension with Playwright, and smoke-check the app-page widget and list overlays.
---

# Run CrosTem (browser extension smoke test)

CrosTem is an MV3 browser extension; "running" it means loading `dist/`
into a real Chromium and visiting Steam store pages where the content
scripts inject the widget/badges.

## Steps

1. Build the extension (from the repo root, on the branch under test):

   ```bash
   npm run build
   ```

2. Run the smoke driver (Playwright is already a devDependency;
   browsers live in `~/Library/Caches/ms-playwright`):

   ```bash
   node .claude/skills/run/smoke.mjs
   ```

   It loads `dist/` in headless Chromium, opens the RimWorld app page
   (known native-mac game, AGW-backed architecture), a search page
   (overlay badges), a wishlist (row badges) and the community games
   list (library badges), asserts the expected DOM, and writes
   `badge.png` / `overlay.png` / `wishlist.png` / `library.png`. Set
   `SMOKE_OUT=<dir>` to send the screenshots somewhere else (e.g. the
   session scratchpad) instead of next to the script.

3. **Look at the screenshots.** `badge.png` must show the "RUNS ON
   MAC?" box with stars + architecture line; `overlay.png` the search
   results with "M"/"Intel~" tags; `wishlist.png` (when produced) one
   star badge per wishlist row; `library.png` one badge next to each
   game title. A `PASS` line plus sane screenshots is the success
   criterion.

## Login-gated checks

The wishlist and library checks need a real Steam session. Create the
profile once:

```bash
node .claude/skills/run/login.mjs          # headed; log in, it waits
SMOKE_PROFILE=~/.crostem-smoke-profile node .claude/skills/run/smoke.mjs
```

## Gotchas (all hit in practice)

- Extensions do NOT work in the `chromium_headless_shell`. The driver
  must use `channel: 'chromium'` (full build) — headless is then fine.
- Extensions require `launchPersistentContext` (a user-data-dir), not
  `chromium.launch()`. The driver creates a throwaway profile per run.
- The widget renders in two passes: an immediate badge, then a
  re-render when the AppleGamingWiki lookup resolves. Wait for the
  specific element you need (e.g. the AGW source link), not just
  `.crostem-box`.
- Real network: the run hits store.steampowered.com and
  applegamingwiki.com. Allow ~30 s timeouts; a hard failure usually
  means no network, not a code bug.
- Steam pages for DLC (e.g. RimWorld - Biotech) resolve as `Intel~`
  from Steam requirements — useful to eyeball the inferred path on the
  same search page.
- Steam answers **429 "Wishlist - Error" to every anonymous wishlist
  view**, so the wishlist check soft-skips when no rows render. To
  exercise it for real, point `SMOKE_PROFILE=<dir>` at a persistent
  Chromium profile with a logged-in Steam session (see above); the
  check then opens the profile's own `/wishlist/`. Override the
  target with `SMOKE_WISHLIST=<url>`. Rows present without badges is
  a hard FAIL; no rows is only a skip.
- The community games list (`/my/games?tab=all`) is **login-gated even
  for a public profile**: anonymous requests answer 200 with the Sign
  In page, so the library check is skipped entirely without
  `SMOKE_PROFILE`. Override the target with `SMOKE_LIBRARY=<url>`.
- The library check also guards the two things unique to running off
  `store.steampowered.com`: duplicate badges (a row links the same app
  from title, capsule and menu) and untranslated i18n keys (which mean
  `steamcommunity.com` is missing from `web_accessible_resources`).
