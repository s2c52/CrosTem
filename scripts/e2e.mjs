// Suite e2e manual (pre-release): carga dist/ en Brave con un perfil temporal
// y verifica las superficies reales de Steam. No corre en CI (Steam real es
// frágil ahí); se ejecuta en local con `npm run e2e` y las capturas quedan en
// e2e-results/ para entregarlas como evidencia de la verificación.
//
// Requiere: npm run build previo y Brave instalado.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'dist');
const OUT = join(ROOT, 'e2e-results');
const PROFILE = join(OUT, 'brave-profile');
const BRAVE = process.env.BRAVE_BIN ??
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

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

// Steam muestra age-gate intermitente en perfiles nuevos; la cookie lo evita.
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

// 1. Ficha de Elden Ring (solo Windows): widget completo
await page.goto('https://store.steampowered.com/app/1245620/ELDEN_RING/', { waitUntil: 'domcontentloaded' });
await check('widget en ficha (Elden Ring)', async () => {
  const widget = page.locator('#crostem-widget .crostem-box');
  await widget.waitFor({ timeout: 25000 });
  await page.waitForFunction(() => {
    const w = document.querySelector('#crostem-widget');
    return w && !/Checking/.test(w.textContent) && w.textContent.trim().length > 0;
  }, null, { timeout: 25000 });
  await widget.screenshot({ path: join(OUT, 'app-widget.png') });
  const text = await widget.textContent();
  if (!/Last Tested/i.test(text)) throw new Error('sin "Last Tested": ' + text.slice(0, 120));
  return text.replace(/\s+/g, ' ').trim().slice(0, 100);
});

// 2. Ficha de Stardew Valley (nativo Mac): badge Native
await page.goto('https://store.steampowered.com/app/413150/Stardew_Valley/', { waitUntil: 'domcontentloaded' });
await check('badge nativo (Stardew Valley)', async () => {
  const widget = page.locator('#crostem-widget .crostem-box');
  await widget.waitFor({ timeout: 20000 });
  const text = await widget.textContent();
  if (!/Native on macOS/.test(text)) throw new Error('sin badge nativo: ' + text.slice(0, 120));
  await widget.screenshot({ path: join(OUT, 'native.png') });
  return 'Native on macOS';
});

// 3. Overlays en cápsulas de la propia ficha ("more like this")
await check('overlays en cápsulas (ficha + scroll)', async () => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.7));
  await page.waitForSelector('.crostem-overlay:not(:empty)', { timeout: 30000 });
  return `${await page.locator('.crostem-overlay:not(:empty)').count()} overlays con contenido`;
});

// 4. Portada de la tienda
await page.goto('https://store.steampowered.com/', { waitUntil: 'domcontentloaded' });
await check('overlays en portada', async () => {
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForSelector('.crostem-overlay:not(:empty)', { timeout: 30000 });
  const count = await page.locator('.crostem-overlay:not(:empty)').count();
  await page.screenshot({ path: join(OUT, 'home.png') });
  return `${count} overlays con contenido`;
});

// 5. Búsqueda
await page.goto('https://store.steampowered.com/search/?term=dark+souls', { waitUntil: 'domcontentloaded' });
await check('badges en búsqueda (dark souls)', async () => {
  await page.waitForSelector('.crostem-badge:not(:empty)', { timeout: 30000 });
  await page.waitForTimeout(3000);
  const count = await page.locator('.crostem-badge:not(:empty)').count();
  await page.locator('#search_resultsRows').screenshot({ path: join(OUT, 'search.png') }).catch(() => {});
  return `${count} badges con contenido`;
});

console.log('\n===== RESULTADOS =====');
for (const r of results) console.log(r);
console.log(`Capturas en: ${OUT}`);
await ctx.close();
rmSync(PROFILE, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
