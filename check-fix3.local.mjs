import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const EXT = join(process.cwd(), 'dist');
const PROFILE = mkdtempSync(join(tmpdir(), 'ct-fix3-'));
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
const n = Math.min(await candidates.count(), 20);
let result = null;
for (let i = 0; i < n && !result; i++) {
  try { await candidates.nth(i).scrollIntoViewIfNeeded(); await candidates.nth(i).hover(); } catch { continue; }
  // Wait up to 12s for the visible card's badge to fill in.
  for (let w = 0; w < 12 && !result; w++) {
    await page.waitForTimeout(1000);
    result = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.LibraryAssetExpandedDisplay')].find((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 300 && r.height > 300 && r.top < 900 && r.bottom > 0;
      });
      if (!card) return null;
      const badge = card.querySelector('.crostem-hovercard-badge');
      const price = card.querySelector('.StoreSalePriceWidgetContainer');
      if (!badge || !badge.textContent) return null;
      const bp = badge.getBoundingClientRect(), pp = price?.getBoundingClientRect();
      return {
        overlaysInCard: card.querySelectorAll('.crostem-overlay').length,
        badgeText: badge.textContent.slice(0, 40),
        badgeBelowPrice: pp ? bp.top >= pp.bottom - 2 : null,
      };
    });
  }
}
console.log(result ? JSON.stringify(result, null, 1) : 'BADGE NEVER FILLED');
const card = page.locator('.LibraryAssetExpandedDisplay').filter({ has: page.locator('.crostem-hovercard-badge') });
try {
  const visible = await page.evaluateHandle(() =>
    [...document.querySelectorAll('.LibraryAssetExpandedDisplay')].find((c) => c.getBoundingClientRect().width > 300),
  );
  await visible.asElement()?.screenshot({ path: 'fix-card.png' });
} catch {}
await ctx.close();
