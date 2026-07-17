import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const EXT = join(process.cwd(), 'dist');
const PROFILE = mkdtempSync(join(tmpdir(), 'ct-fix2-'));
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, executablePath: BRAVE, viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
});
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (/crostem|CrosTem/i.test(t)) console.log('[console]', t.slice(0, 150)); });
await page.goto('https://store.steampowered.com/category/action/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(1500);
const candidates = page.locator('a[href*="/app/"]');
const n = Math.min(await candidates.count(), 15);
for (let i = 0; i < n; i++) {
  try { await candidates.nth(i).scrollIntoViewIfNeeded(); await candidates.nth(i).hover(); } catch { continue; }
  await page.waitForTimeout(1500);
  const has = await page.evaluate(() => !!document.querySelector('.crostem-hovercard-badge'));
  if (has) break;
}
// Watch the badge for 8s: is it the SAME node over time? does IO fire?
const info = await page.evaluate(async () => {
  const badge = document.querySelector('.crostem-hovercard-badge');
  if (!badge) return { badge: false };
  const rect = badge.getBoundingClientRect();
  const style = getComputedStyle(badge);
  badge.dataset.debugMark = 'X';
  await new Promise((r) => setTimeout(r, 5000));
  const again = document.querySelector('.crostem-hovercard-badge');
  return {
    badge: true,
    rect: { t: rect.top, l: rect.left, w: rect.width, h: rect.height },
    display: style.display,
    visibility: style.visibility,
    sameNode: again?.dataset.debugMark === 'X',
    stillInDom: !!again,
    cardCount: document.querySelectorAll('.LibraryAssetExpandedDisplay').length,
    text: again?.textContent ?? null,
  };
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
