# Contributing to CrosTem

Thanks for your interest in contributing! Bug reports, parser fixes and features are all welcome.

## Getting started

```bash
npm install
npm run dev        # vite in watch mode (reloads the extension on save)
npm run build      # typecheck + vite build → dist/
npm test           # unit tests (vitest)
```

Load the extension in Brave/Chrome: `brave://extensions` → Developer mode → **Load unpacked** → select `dist/`.

Before opening a PR, make sure the verification gate passes:

```bash
./scripts/verify.sh   # typecheck + tests + build
```

## The most valuable contribution: keeping the parsers alive

CrosTem scrapes codeweavers.com, which has no public API. When they change their HTML, the extension breaks. All scraping lives in `src/lib/parser.ts`, and `tests/parser.test.ts` runs against real HTML fixtures in `tests/fixtures/` — the header comment in the test file explains how to recapture them. If you fix a parser, include updated fixtures.

## Guidelines

- **Language**: code comments, commit messages and identifiers are in English.
- **Tests**: changes to `src/lib/` should come with unit tests. UI-only changes (widget, overlays) can be verified manually — describe how in the PR.
- **License headers**: new source files start with the two-line SPDX header used across the codebase:

  ```ts
  // Copyright (C) <year> <your name>
  // SPDX-License-Identifier: GPL-3.0-or-later
  ```

- **Scope**: keep PRs focused; one topic per PR.

## Developer Certificate of Origin (DCO)

By opening a pull request you certify the [Developer Certificate of Origin](https://developercertificate.org/) — in short, that you wrote the code or otherwise have the right to submit it under the project license (GPL-3.0-or-later).

A `Signed-off-by` trailer is welcome but not required; if you want to add one:

```bash
git commit -s -m "Fix search-row parsing"
```

which appends a `Signed-off-by: Your Name <your@email>` line to the commit message.

## License

By contributing, you agree that your contributions are licensed under the [GPL-3.0-or-later](LICENSE), the same license as the project. No copyright assignment is required — you keep the copyright on your contributions.
