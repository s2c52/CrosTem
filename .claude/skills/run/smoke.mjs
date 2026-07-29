// CrosTem smoke driver: loads dist/ into headless Chromium and checks the
// app-page widget, the search-page overlay badges, the wishlist row badges
// and the community library badges on real Steam.
// Usage: node .claude/skills/run/smoke.mjs   (after `npm run build`)
// Screenshots go next to this file, or to $SMOKE_OUT if set.
// $SMOKE_PROFILE: persistent profile dir with a logged-in Steam session
// (create one with login.mjs). Without it the wishlist check soft-skips
// (Steam 429s anonymous views) and the library check is skipped outright
// (that page is login-gated).
// $SMOKE_WISHLIST / $SMOKE_LIBRARY: explicit URLs to check.
import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const DIST = join(ROOT, 'dist');
const OUT = process.env.SMOKE_OUT || HERE;
const PROFILE = process.env.SMOKE_PROFILE || mkdtempSync(join(tmpdir(), 'crostem-'));

const ctx = await chromium.launchPersistentContext(PROFILE, {
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

// Wishlist: one inline badge per row. Steam rate-limits anonymous
// wishlist views (429 error page), so when no rows render the check
// degrades to a soft skip; rows without badges are a hard failure.
const wishlistUrl =
  process.env.SMOKE_WISHLIST ||
  (process.env.SMOKE_PROFILE
    ? 'https://store.steampowered.com/wishlist/'
    : 'https://store.steampowered.com/wishlist/id/s2c52/');
await page.goto(wishlistUrl, { waitUntil: 'domcontentloaded' });
let wishlistRows = 0;
try {
  await page.waitForFunction(() => document.querySelectorAll('a[href*="/app/"]').length >= 3, {
    timeout: 20000,
  });
  wishlistRows = await page.evaluate(() => document.querySelectorAll('a[href*="/app/"]').length);
} catch {
  // Rows never rendered: rate-limited, private or logged out.
}
if (wishlistRows === 0) {
  console.log('wishlist: no rows rendered (429/private/logged out) — check skipped');
} else {
  try {
    await page.waitForFunction(() => document.querySelectorAll('.crostem-badge').length >= 1, {
      timeout: 30000,
    });
    const n = await page.evaluate(() => document.querySelectorAll('.crostem-badge').length);
    console.log('wishlist badges:', n, 'on', wishlistRows, 'app links');
  } catch {
    fails.push(`wishlist rows present (${wishlistRows} app links) but no badges appeared`);
  }
  await page.screenshot({ path: join(OUT, 'wishlist.png') });
}

// Community library: one inline badge next to each game title. The page is
// login-gated (an anonymous GET returns the Sign In page), so without a
// logged-in SMOKE_PROFILE the check is skipped outright; rows rendering
// without badges is a hard failure.
const libraryUrl =
  process.env.SMOKE_LIBRARY ||
  (process.env.SMOKE_PROFILE ? 'https://steamcommunity.com/my/games?tab=all' : null);
if (!libraryUrl) {
  console.log('library: needs a Steam session (SMOKE_PROFILE unset) — check skipped');
} else {
  await page.goto(libraryUrl, { waitUntil: 'domcontentloaded' });
  let libraryRows = 0;
  try {
    await page.waitForFunction(() => document.querySelectorAll('a[href*="/app/"]').length >= 3, {
      timeout: 20000,
    });
    libraryRows = await page.evaluate(() => document.querySelectorAll('a[href*="/app/"]').length);
  } catch {
    // Rows never rendered: logged out, private profile or a Steam error page.
  }
  if (libraryRows === 0) {
    console.log('library: no rows rendered (logged out/private) — check skipped');
  } else {
    try {
      await page.waitForFunction(() => document.querySelectorAll('.crostem-badge').length >= 1, {
        timeout: 30000,
      });
      const n = await page.evaluate(() => document.querySelectorAll('.crostem-badge').length);
      // Inserting the host span is not the interesting part: wait for badges
      // that actually RESOLVED. Counting empty spans would pass even with
      // the whole appdetails/CodeWeavers path broken (which off the store
      // origin is exactly what CORS would do).
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('.crostem-badge')].filter(
            (b) => (b.textContent || '').trim().length > 0,
          ).length >= 3,
        { timeout: 60000 },
      );
      const resolved = await page.evaluate(
        () =>
          [...document.querySelectorAll('.crostem-badge')].filter(
            (b) => (b.textContent || '').trim().length > 0,
          ).length,
      );
      console.log(
        'library badges:',
        n,
        'inserted /',
        resolved,
        'resolved, on',
        libraryRows,
        'app links',
      );
      // One badge per game: the capsule link and the row menu point at the
      // same app and must not each earn one.
      const dupes = await page.evaluate(() => {
        const seen = new Set();
        const dup = [];
        for (const b of document.querySelectorAll('.crostem-badge[data-crostem-appid]')) {
          const id = b.getAttribute('data-crostem-appid');
          if (seen.has(id)) dup.push(id);
          seen.add(id);
        }
        return dup;
      });
      if (dupes.length) fails.push(`library: duplicate badges for apps ${dupes.join(', ')}`);
      // steamcommunity.com must be in web_accessible_resources or the locale
      // dictionaries never load and t() renders the raw key.
      const rawKey = await page.evaluate(() =>
        [...document.querySelectorAll('.crostem-badge')].some((b) =>
          /verdict_|nativeBadge|noDataInline|matchesN/.test(
            b.textContent +
              ' ' +
              (b.querySelector('[aria-label]')?.getAttribute('aria-label') ?? ''),
          ),
        ),
      );
      if (rawKey) {
        fails.push('library: untranslated i18n key in a badge (locales not web-accessible here?)');
      }
    } catch {
      const inserted = await page.evaluate(
        () => document.querySelectorAll('.crostem-badge').length,
      );
      fails.push(
        `library: ${libraryRows} app links, ${inserted} badges inserted, but fewer than 3 resolved`,
      );
    }
    await page.screenshot({ path: join(OUT, 'library.png') });
  }
}

await ctx.close();
if (fails.length) {
  console.error('FAIL:\n- ' + fails.join('\n- '));
  process.exit(1);
}
console.log('PASS');
