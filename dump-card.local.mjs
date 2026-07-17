import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const EXT = join(process.cwd(), 'dist');
const PROFILE = mkdtempSync(join(tmpdir(), 'ct-hover-'));
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, executablePath: BRAVE, viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
});
const page = await ctx.newPage();
await page.goto('https://store.steampowered.com/category/action/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(1500);
const candidates = page.locator('a[href*="/app/"]');
const n = Math.min(await candidates.count(), 15);
let html = null;
for (let i = 0; i < n && !html; i++) {
  try { await candidates.nth(i).scrollIntoViewIfNeeded(); await candidates.nth(i).hover(); } catch { continue; }
  await page.waitForTimeout(2000);
  html = await page.evaluate(() => document.querySelector('.LibraryAssetExpandedDisplay')?.outerHTML ?? null);
}
if (html) writeFileSync('card-dump.local.html', html);
console.log(html ? `dumped ${html.length} chars` : 'NO CARD');
await ctx.close();
