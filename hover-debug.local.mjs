// Local debug (not committed): inspect the React store hover-expanded card.
import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const EXT = join(process.cwd(), 'dist');
const PROFILE = mkdtempSync(join(tmpdir(), 'ct-hover-'));
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const URL = process.argv[2] ?? 'https://store.steampowered.com/category/action/';

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  executablePath: BRAVE,
  viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(2000);

const candidates = page.locator('a[href*="/app/"]');
const n = Math.min(await candidates.count(), 15);
let out = null;
for (let i = 0; i < n && !out; i++) {
  const c = candidates.nth(i);
  try {
    await c.scrollIntoViewIfNeeded();
    await c.hover();
  } catch {
    continue;
  }
  await page.waitForTimeout(2000);
  out = await page.evaluate(() => {
    // The expanded card shows review text; find its container.
    const leaf = [...document.querySelectorAll('body *')].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 200 && r.height > 20 && /English Reviews|Reviews\)/i.test(el.textContent ?? '') && el.children.length <= 3 && el.textContent.length < 80;
    });
    if (!leaf) return null;
    // Walk up to the card root (the big container) and describe it.
    let card = leaf;
    for (let i = 0; i < 12 && card.parentElement; i++) {
      const r = card.parentElement.getBoundingClientRect();
      if (r.height > 460 || card.parentElement === document.body) break;
      card = card.parentElement;
    }
    const brief = (el, depth = 0) => {
      const cls = [...el.classList].join(' ').slice(0, 90);
      const own = el.children.length === 0 ? ` "${(el.textContent ?? '').trim().slice(0, 40)}"` : '';
      let s = `${'  '.repeat(depth)}<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} class="${cls}">${own}\n`;
      if (depth < 5) for (const k of [...el.children].slice(0, 10)) s += brief(k, depth + 1);
      return s;
    };
    return {
      tree: brief(card).slice(0, 6000),
      overlaysInCard: card.querySelectorAll('.crostem-overlay').length,
      anchorsInCard: [...card.querySelectorAll('a[href*="/app/"]')].map((a) =>
        [...a.classList].join(' ').slice(0, 60),
      ),
      cardChain: (() => {
        const chain = [];
        let n2 = card;
        for (let i = 0; i < 6 && n2; i++) {
          chain.push(`${n2.tagName.toLowerCase()}.${[...n2.classList].slice(0, 3).join('.')}`);
          n2 = n2.parentElement;
        }
        return chain;
      })(),
    };
  });
}
console.log(out ? out.tree : 'NO CARD');
if (out) console.log(JSON.stringify({ overlays: out.overlaysInCard, anchors: out.anchorsInCard, chain: out.cardChain }, null, 1));
await page.screenshot({ path: 'hover-shot.png' });
await ctx.close();
