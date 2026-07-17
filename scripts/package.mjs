// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Packages dist/ into a zip ready to upload to the Chrome Web Store.
// Usage: npm run package  →  crostem-v<version>.zip at the repo root.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'dist/manifest.json'), 'utf8'));
const out = join(ROOT, `crostem-v${manifest.version}.zip`);

if (!existsSync(join(ROOT, 'dist'))) {
  console.error('dist/ no existe — corre npm run build primero');
  process.exit(1);
}

rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', out, '.'], { cwd: join(ROOT, 'dist'), stdio: 'ignore' });
console.log(`✓ ${out}`);
