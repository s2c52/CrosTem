import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    // Extensión: sin minificar facilita la revisión de la Web Store y el debug.
    minify: false,
    sourcemap: false,
  },
});
