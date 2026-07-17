// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Generates the Chrome Web Store listing screenshots (exactly 1280×800)
// with the extension loaded from dist/. Output: store-assets/*.png.
// Usage: npm run build && npm run listing
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'dist');
const OUT = join(ROOT, 'store-assets');
const PROFILE = join(OUT, '.profile');
const BRAVE =
  process.env.BRAVE_BIN ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  executablePath: BRAVE,
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--lang=en',
  ],
});

await ctx.addCookies([
  { name: 'birthtime', value: '568022401', domain: 'store.steampowered.com', path: '/' },
  { name: 'lastagecheckage', value: '1-January-1988', domain: 'store.steampowered.com', path: '/' },
]);

const page = await ctx.newPage();

async function shoot(name) {
  await page.screenshot({ path: join(OUT, name) });
  console.log(name);
}

// 1. Game page with verdict (widget in view)
await page.goto('https://store.steampowered.com/app/1245620/ELDEN_RING/', {
  waitUntil: 'domcontentloaded',
});
await page.waitForFunction(
  () => {
    const w = document.querySelector('#crostem-widget');
    return w && !/Checking/.test(w.textContent) && w.textContent.trim().length > 0;
  },
  null,
  { timeout: 30000 },
);
await page.locator('#crostem-widget').scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await shoot('1-game-page-verdict.png');

// 2. Game page with blocked anticheat
await page.goto('https://store.steampowered.com/app/1085660/Destiny_2/', {
  waitUntil: 'domcontentloaded',
});
await page.waitForFunction(
  () => {
    const w = document.querySelector('#crostem-widget');
    return w && !/Checking/.test(w.textContent);
  },
  null,
  { timeout: 30000 },
);
await page.locator('#crostem-widget').scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await shoot('2-anticheat-warning.png');

// 3. Front page with overlays
await page.goto('https://store.steampowered.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.scrollTo(0, 700));
await page.waitForSelector('.crostem-overlay:not(:empty)', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(4000);
await shoot('3-store-overlays.png');

// 4. Search with badges
await page.goto('https://store.steampowered.com/search/?term=dark+souls', {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('.crostem-badge:not(:empty)', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(5000);
await shoot('4-search-badges.png');

// 5. Options page
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
if (sw) {
  const extId = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${extId}/src/options/options.html`);
  await page.waitForTimeout(500);
  await shoot('5-options.png');
}

await ctx.close();
rmSync(PROFILE, { recursive: true, force: true });
console.log(`Assets en: ${OUT}`);
