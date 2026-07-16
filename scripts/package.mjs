// Empaqueta dist/ en un zip listo para subir a la Chrome Web Store.
// Uso: npm run package  →  crostem-v<version>.zip en la raíz del repo.
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
