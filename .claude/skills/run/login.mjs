// One-time setup for the login-gated smoke checks (wishlist, library).
// Opens a HEADED Chromium on a persistent profile at Steam's login page and
// waits until you are signed in, then closes. Point SMOKE_PROFILE at the
// same dir afterwards and smoke.mjs will exercise the gated pages for real.
// Usage: node .claude/skills/run/login.mjs [profile-dir]
import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROFILE =
  process.argv[2] || process.env.SMOKE_PROFILE || join(homedir(), '.crostem-smoke-profile');

console.log('profile dir:', PROFILE);
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: false,
  viewport: { width: 1400, height: 1000 },
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('https://steamcommunity.com/login/home/?goto=', { waitUntil: 'domcontentloaded' });
console.log('Log into Steam in the window that just opened (2FA included).');
console.log('Waiting for the session… (Ctrl-C to abort)');

// steamLoginSecure is only set once the session is established.
try {
  await page.waitForFunction(
    () => document.cookie.includes('steamLoginSecure') || !/login/.test(location.pathname),
    { timeout: 10 * 60_000 },
  );
  console.log('\nSession established. Now run:');
  console.log(`  SMOKE_PROFILE=${PROFILE} node .claude/skills/run/smoke.mjs`);
} catch {
  console.error('\nTimed out waiting for the login. Nothing was saved beyond the profile dir.');
  process.exitCode = 1;
}

await ctx.close();
