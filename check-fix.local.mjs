import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const EXT = join(process.cwd(), 'dist');
const PROFILE = mkdtempSync(join(tmpdir(), 'ct-fix-'));
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
let result = null;
for (let i = 0; i < n && !result; i++) {
  try { await candidates.nth(i).scrollIntoViewIfNeeded(); await candidates.nth(i).hover(); } catch { continue; }
  await page.waitForTimeout(9000);
  result = await page.evaluate(() => {
    const card = document.querySelector('.LibraryAssetExpandedDisplay');
    if (!card) return null;
    const overlays = card.querySelectorAll('.crostem-overlay').length;
    const badge = card.querySelector('.crostem-hovercard-badge');
    const price = card.querySelector('.StoreSalePriceWidgetContainer');
    let below = null;
    if (badge && price) {
      const bp = badge.getBoundingClientRect(), pp = price.getBoundingClientRect();
      below = bp.top >= pp.bottom - 2;
    }
    return {
      overlaysInCard: overlays,
      badgePresent: !!badge,
      badgeText: badge?.textContent?.slice(0, 40) ?? null,
      badgeBelowPrice: below,
    };
  });
  if (result && !result.badgePresent) result = null; // badge may still be resolving; try next
}
console.log(JSON.stringify(result, null, 1) ?? 'NO CARD');
const card = page.locator('.LibraryAssetExpandedDisplay');
if (await card.count()) await card.first().screenshot({ path: 'fix-card.png' }).catch(() => {});
await ctx.close();
