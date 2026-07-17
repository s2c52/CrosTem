// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Manual e2e suite (pre-release): loads dist/ into Brave with a temporary
// profile and checks the real Steam surfaces. Does not run in CI (real Steam
// is flaky there); it runs locally via `npm run e2e` and the screenshots land
// in e2e-results/ to be handed over as verification evidence.
//
// Requires: a prior npm run build and Brave installed.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'dist');
const OUT = join(ROOT, 'e2e-results');
const PROFILE = join(OUT, 'brave-profile');
const BRAVE =
  process.env.BRAVE_BIN ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  executablePath: BRAVE,
  viewport: { width: 1400, height: 900 },
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

// Steam shows an intermittent age gate on fresh profiles; the cookie avoids it.
await ctx.addCookies([
  { name: 'birthtime', value: '568022401', domain: 'store.steampowered.com', path: '/' },
  { name: 'lastagecheckage', value: '1-January-1988', domain: 'store.steampowered.com', path: '/' },
]);

const page = await ctx.newPage();
const results = [];
let failed = false;

async function check(label, fn) {
  try {
    const detail = await fn();
    results.push(`PASS ${label}${detail ? ' — ' + detail : ''}`);
  } catch (e) {
    failed = true;
    results.push(`FAIL ${label} — ${String(e.message).split('\n')[0]}`);
  }
}

// 1. Elden Ring game page (Windows-only): full widget
await page.goto('https://store.steampowered.com/app/1245620/ELDEN_RING/', {
  waitUntil: 'domcontentloaded',
});
await check('widget en ficha (Elden Ring)', async () => {
  const widget = page.locator('#crostem-widget .crostem-box');
  await widget.waitFor({ timeout: 25000 });
  await page.waitForFunction(
    () => {
      const w = document.querySelector('#crostem-widget');
      return w && !w.querySelector(".crostem-skeleton") && w.textContent.trim().length > 20;
    },
    null,
    { timeout: 25000 },
  );
  await widget.screenshot({ path: join(OUT, 'app-widget.png') });
  const text = await widget.textContent();
  if (!/Last Tested/i.test(text)) throw new Error('sin "Last Tested": ' + text.slice(0, 120));
  return text.replace(/\s+/g, ' ').trim().slice(0, 100);
});

// 1b. Multi-source verdict present on the game page
await check('veredicto + desglose multi-fuente (Elden Ring)', async () => {
  const widget = page.locator('#crostem-widget .crostem-box');
  const text = await widget.textContent();
  if (!/Playable/i.test(text)) throw new Error('sin etiqueta de veredicto: ' + text.slice(0, 120));
  const dots = await page.locator('#crostem-widget .crostem-dot').count();
  if (dots < 1) throw new Error('sin punto de semáforo');
  const agw = /AppleGamingWiki/i.test(text) ? 'AGW ✓' : 'AGW sin datos';
  const ac = /Anticheat/i.test(text) ? 'anticheat ✓' : 'sin anticheat';
  return `${agw} · ${ac}`;
});

// 1b-bis. Redesign: verdict banner + collapsible source row
await check('banner de veredicto + fila expandible (Elden Ring)', async () => {
  const banner = page.locator('#crostem-widget .crostem-banner');
  if ((await banner.count()) === 0) throw new Error('sin banner de veredicto');
  const cls = (await banner.getAttribute('class')) ?? '';
  const row = page.locator('#crostem-widget button.crostem-source-toggle').first();
  await row.click();
  await page.waitForTimeout(400);
  const expanded = await row.getAttribute('aria-expanded');
  await page
    .locator('#crostem-widget .crostem-box')
    .screenshot({ path: join(OUT, 'widget-expanded.png') });
  if (expanded !== 'true') throw new Error('aria-expanded no cambió al expandir');
  return /crostem-banner-\w+/.exec(cls)?.[0] ?? 'banner';
});

// 1c. Game with blocked anticheat (Destiny 2 = Denied on AWACY): red + warning
await page.goto('https://store.steampowered.com/app/1085660/Destiny_2/', {
  waitUntil: 'domcontentloaded',
});
await check('anticheat Denied baja el semáforo (Destiny 2)', async () => {
  const widget = page.locator('#crostem-widget .crostem-box');
  await widget.waitFor({ timeout: 25000 });
  await page.waitForFunction(
    () => {
      const w = document.querySelector('#crostem-widget');
      return w && !w.querySelector(".crostem-skeleton");
    },
    null,
    { timeout: 25000 },
  );
  const text = await widget.textContent();
  if (!/Anticheat/i.test(text)) throw new Error('sin sección anticheat: ' + text.slice(0, 150));
  const red = await page.locator('#crostem-widget .crostem-dot-red').count();
  await widget.screenshot({ path: join(OUT, 'anticheat.png') });
  return red >= 1
    ? 'semáforo rojo + aviso'
    : 'aviso presente (semáforo no rojo: ' + text.slice(0, 80) + ')';
});

// 2. Stardew Valley game page (Mac native): Native badge
await page.goto('https://store.steampowered.com/app/413150/Stardew_Valley/', {
  waitUntil: 'domcontentloaded',
});
await check('badge nativo (Stardew Valley)', async () => {
  const widget = page.locator('#crostem-widget .crostem-box');
  await widget.waitFor({ timeout: 20000 });
  const text = await widget.textContent();
  if (!/Native on macOS/.test(text)) throw new Error('sin badge nativo: ' + text.slice(0, 120));
  // The architecture arrives async and re-renders the box: let it settle
  // before screenshotting, or the locator points at a detached node.
  await page.waitForTimeout(2500);
  await page.locator('#crostem-widget .crostem-box').screenshot({ path: join(OUT, 'native.png') });
  return 'Native on macOS';
});

// 3. Overlays on the game page's own capsules ("more like this")
await check('overlays en cápsulas (ficha + scroll)', async () => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.7));
  await page.waitForSelector('.crostem-overlay:not(:empty)', { timeout: 30000 });
  return `${await page.locator('.crostem-overlay:not(:empty)').count()} overlays con contenido`;
});

// 4. Store front page
await page.goto('https://store.steampowered.com/', { waitUntil: 'domcontentloaded' });
await check('overlays en portada', async () => {
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForSelector('.crostem-overlay:not(:empty)', { timeout: 30000 });
  const count = await page.locator('.crostem-overlay:not(:empty)').count();
  await page.screenshot({ path: join(OUT, 'home.png') });
  return `${count} overlays con contenido`;
});

// 5. Search
await page.goto('https://store.steampowered.com/search/?term=dark+souls', {
  waitUntil: 'domcontentloaded',
});
await check('badges en búsqueda (dark souls)', async () => {
  await page.waitForSelector('.crostem-badge:not(:empty)', { timeout: 30000 });
  await page.waitForTimeout(3000);
  const count = await page.locator('.crostem-badge:not(:empty)').count();
  await page
    .locator('#search_resultsRows')
    .screenshot({ path: join(OUT, 'search.png') })
    .catch(() => {});
  return `${count} badges con contenido`;
});

// 5b. Rich tooltip on hover over a search badge. Steam re-renders search
// rows while resolving, which can swap the hovered node: retry a few times.
await check('tooltip enriquecido en badge de búsqueda', async () => {
  let visible = false;
  for (let attempt = 0; attempt < 3 && !visible; attempt++) {
    await page.mouse.move(0, 0); // leave the badge so mouseenter re-fires
    const badge = page.locator('.crostem-badge .crostem-badge-result').first();
    await badge.scrollIntoViewIfNeeded();
    // Any scroll hides the tooltip by design: let the scroll settle first.
    await page.waitForTimeout(600);
    await badge.hover();
    visible = await page
      .waitForSelector('.crostem-tooltip-visible', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!visible) throw new Error('tooltip no visible tras 3 intentos');
  await page.screenshot({ path: join(OUT, 'tooltip.png') });
  return 'tooltip visible';
});

// 5c. prefers-reduced-motion turns CrosTem animations off
await check('prefers-reduced-motion apaga animaciones', async () => {
  const rm = await ctx.newPage();
  await rm.emulateMedia({ reducedMotion: 'reduce' });
  await rm.goto('https://store.steampowered.com/app/1245620/ELDEN_RING/', {
    waitUntil: 'domcontentloaded',
  });
  await rm.waitForSelector('#crostem-widget .crostem-box', { timeout: 25000 });
  const anim = await rm.evaluate(() => {
    const el = document.querySelector('#crostem-widget .crostem-box');
    return getComputedStyle(el).animationName;
  });
  await rm.close();
  if (anim !== 'none') throw new Error('animation-name=' + anim);
  return 'animaciones desactivadas';
});

// --- F3: popup, options and toggles ---
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
const extId = sw ? new URL(sw.url()).host : null;

// 6. Popup: manual search box
await check('popup con buscador (baldur)', async () => {
  if (!extId) throw new Error('sin id de extensión (service worker no visible)');
  await page.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await page.fill('#query', 'baldur');
  await page.waitForSelector('#results .result', { timeout: 20000 });
  const count = await page.locator('#results .result').count();
  await page.screenshot({ path: join(OUT, 'popup.png') });
  return `${count} resultados`;
});

// 7. Options: opens, reflects defaults, and the capsules toggle disables overlays
await check('options + toggle de cápsulas', async () => {
  if (!extId) throw new Error('sin id de extensión');
  await page.goto(`chrome-extension://${extId}/src/options/options.html`);
  const appChecked = await page.locator('#surface-app').isChecked();
  if (!appChecked) throw new Error('defaults no aplicados');
  await page.screenshot({ path: join(OUT, 'options.png') });
  // The real checkbox is visually hidden behind the switch: force it.
  await page.locator('#surface-capsules').uncheck({ force: true }); // triggers save
  await page.waitForSelector('#apply-bar:not([hidden])', { timeout: 5000 });
  await page.screenshot({ path: join(OUT, 'options-apply.png') });
  await page.waitForTimeout(500);
  await page.goto('https://store.steampowered.com/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(8000);
  const overlays = await page.locator('.crostem-overlay').count();
  if (overlays > 0)
    throw new Error(`overlays presentes con la superficie desactivada: ${overlays}`);
  return 'overlays desactivados correctamente';
});

// 8. Onboarding welcome page renders
await check('página de onboarding', async () => {
  if (!extId) throw new Error('sin id de extensión');
  await page.goto(`chrome-extension://${extId}/src/onboarding/onboarding.html`);
  await page.waitForSelector('.surface-grid .card', { timeout: 5000 });
  const cards = await page.locator('.surface-grid .card').count();
  await page.screenshot({ path: join(OUT, 'onboarding.png'), fullPage: true });
  if (cards < 4) throw new Error(`solo ${cards} cards`);
  return `${cards} cards`;
});

console.log('\n===== RESULTADOS =====');
for (const r of results) console.log(r);
console.log(`Capturas en: ${OUT}`);
await ctx.close();
rmSync(PROFILE, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
