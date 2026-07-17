// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Packages dist/ into a zip ready to upload to the Chrome Web Store.
// Usage: npm run package  →  crostem-v<version>.zip at the repo root.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (!existsSync(join(ROOT, 'dist'))) {
  console.error('dist/ no existe — corre npm run build primero');
  process.exit(1);
}

const manifestPath = join(ROOT, 'dist/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// use_dynamic_url stays false (crxjs default), accepting that a Steam
// page can probe stable chrome-extension:// URLs to detect the
// extension. Flipping it to true was tried and reverted: since Chrome
// 130 dynamic-url resources are unreachable through their static URL,
// which breaks both the crxjs content-script loaders and the runtime
// locale fetch (e2e 2026-07-17: every content-script surface failed;
// extension pages kept working). Revisit if crxjs ships native support.

const out = join(ROOT, `crostem-v${manifest.version}.zip`);
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', out, '.'], { cwd: join(ROOT, 'dist'), stdio: 'ignore' });
const kb = Math.round(statSync(out).size / 1024);
console.log(`✓ ${out} (${kb} KB)`);
