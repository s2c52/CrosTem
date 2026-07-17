import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const EXT = join(process.cwd(), 'dist');
const PROFILE = mkdtempSync(join(tmpdir(), 'ct-fix4-'));
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, executablePath: BRAVE, viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
});
const page = await ctx.newPage();
await page.goto('https://store.steampowered.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

const results = [];
// Hover tile-like capsules (narrow) further down the page.
const tiles = page.locator('a[href*="/app/"]');
const n = Math.min(await tiles.count(), 40);
for (let i = 0; i < n && results.length < 3; i++) {
  const t = tiles.nth(i);
  let box;
  try { box = await t.boundingBox(); } catch { continue; }
  if (!box || box.width > 350 || box.width < 100) continue; // vertical/grid tiles only
  try { await t.scrollIntoViewIfNeeded(); await t.hover(); } catch { continue; }
  let r = null;
  for (let w = 0; w < 10 && !r; w++) {
    await page.waitForTimeout(1000);
    if (!page.url().includes('store.steampowered.com/?') && page.url() !== 'https://store.steampowered.com/') {
      await page.goto('https://store.steampowered.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      break;
    }
    r = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.LibraryAssetExpandedDisplay')].find((c) => {
        const b = c.getBoundingClientRect();
        return b.width > 250 && b.height > 300 && b.top < 900 && b.bottom > 0;
      });
      if (!card) return null;
      const badge = card.querySelector('.crostem-hovercard-badge');
      const price = card.querySelector('.StoreSalePriceWidgetContainer');
      if (!badge || !badge.textContent || !price) return null;
      const bp = badge.getBoundingClientRect(), pp = price.getBoundingClientRect();
      return {
        cardW: Math.round(card.getBoundingClientRect().width),
        badgeText: badge.textContent.slice(0, 30),
        below: bp.top >= pp.bottom - 2,
        overlays: card.querySelectorAll('.crostem-overlay').length,
      };
    }).catch(() => null);
  }
  if (r) {
    results.push(r);
    const card = await page.evaluateHandle(() =>
      [...document.querySelectorAll('.LibraryAssetExpandedDisplay')].find((c) => c.getBoundingClientRect().width > 250 && c.getBoundingClientRect().height > 300 && c.getBoundingClientRect().top < 900),
    );
    try { await card.asElement()?.screenshot({ path: `fix-tile-${results.length}.png` }); } catch {}
  }
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
}
console.log(JSON.stringify(results, null, 1));
await ctx.close();
