// CrosTem smoke driver: loads dist/ into headless Chromium and checks
// the app-page widget and the search-page overlay badges on real Steam.
// Usage: node .claude/skills/run/smoke.mjs   (after `npm run build`)
// Screenshots go next to this file, or to $SMOKE_OUT if set.
import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const DIST = join(ROOT, 'dist');
const OUT = process.env.SMOKE_OUT || HERE;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'crostem-')), {
  channel: 'chromium', // full build: headless_shell can't load extensions
  headless: true,
  viewport: { width: 1400, height: 1000 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const page = await ctx.newPage();
const fails = [];

// App page (RimWorld: native mac, architecture comes from AGW).
await page.goto('https://store.steampowered.com/app/294100/RimWorld/', {
  waitUntil: 'domcontentloaded',
});
const box = page.locator('.crostem-box');
await box.waitFor({ timeout: 30000 });
const srcLink = box.locator('a', { hasText: /AppleGamingWiki/i }).first();
try {
  await srcLink.waitFor({ timeout: 30000 });
  const href = await srcLink.getAttribute('href');
  console.log('app-page source link ->', href);
  if (!href?.includes('applegamingwiki.com/wiki/RimWorld')) {
    fails.push(`unexpected href: ${href}`);
  }
} catch {
  fails.push('AGW source link never appeared in native badge');
  console.log('badge HTML:', await box.innerHTML().catch(() => '<gone>'));
}
await box
  .screenshot({ path: join(OUT, 'badge.png') })
  .catch(() => page.screenshot({ path: join(OUT, 'badge.png') }));

// Search page: overlay tag + tooltip naming the source.
await page.goto('https://store.steampowered.com/search/?term=rimworld', {
  waitUntil: 'domcontentloaded',
});
// Since the a11y redesign the badge announces itself via aria-label
// (the visual detail lives in the rich hover tooltip).
const tag = page.locator('.crostem-badge-native').first();
try {
  await tag.waitFor({ timeout: 30000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.crostem-badge-native')?.getAttribute('aria-label')?.includes('·'),
    { timeout: 30000 },
  );
  const label = await tag.getAttribute('aria-label');
  console.log('overlay aria-label:', JSON.stringify(label));
  if (!/·\s*Architecture (per|inferred|estimated)/.test(label ?? '')) {
    fails.push(`aria-label missing source: ${label}`);
  }
  await page.screenshot({ path: join(OUT, 'overlay.png') });
} catch (e) {
  fails.push('overlay native badge/tooltip not found: ' + e.message.split('\n')[0]);
  await page.screenshot({ path: join(OUT, 'overlay.png') });
}

await ctx.close();
if (fails.length) {
  console.error('FAIL:\n- ' + fails.join('\n- '));
  process.exit(1);
}
console.log('PASS');
