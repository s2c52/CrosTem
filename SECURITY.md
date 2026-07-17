# Security Policy

## Supported versions

Only the latest published version of CrosTem receives security fixes.

## Reporting a vulnerability

CrosTem is a browser extension that runs on Steam store pages and parses HTML from third-party sites, so injection issues (e.g. unsanitized scraped content reaching the DOM) are taken seriously.

**Please do not open a public issue for security problems.** Instead, use GitHub's private vulnerability reporting: go to the repository's **Security** tab → **Report a vulnerability**. You should get a first response within a week.

Please include:

- The affected surface (game page widget, capsule overlays, search, wishlist, options, popup).
- Steps to reproduce, ideally with the specific Steam page and/or the crafted CodeWeavers/AppleGamingWiki content involved.
- The impact you believe it has.

## Scope notes

- CrosTem stores no credentials and sends no user data anywhere; the only stored data is a local cache of compatibility results and user matching choices (`chrome.storage.local`). See the [privacy policy](docs/privacy-policy.md).
- Vulnerabilities in the third-party sites CrosTem reads from (codeweavers.com, applegamingwiki.com, areweanticheatyet.com, steampowered.com) should be reported to those sites, not here — unless CrosTem mishandles their content.
