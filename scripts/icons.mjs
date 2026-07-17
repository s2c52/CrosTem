// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Generates the icon PNGs (16/32/48/128) from public/icons/icon.svg
// by rendering it in the browser via Playwright (no native dependencies).
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = readFileSync(join(ROOT, 'public/icons/icon.svg'), 'utf8');
const SIZES = [16, 32, 48, 128];
const BRAVE =
  process.env.BRAVE_BIN ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const browser = await chromium.launch({ executablePath: BRAVE, headless: true });
const page = await browser.newPage();

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  const html = `<!DOCTYPE html><style>*{margin:0}body{background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${SVG}`;
  await page.setContent(html);
  await page.screenshot({
    path: join(ROOT, 'public/icons', `icon${size}.png`),
    omitBackground: true,
  });
  console.log(`icon${size}.png`);
}

await browser.close();
