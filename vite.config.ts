// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    // Extension: unminified code eases Web Store review; source maps aid debugging.
    minify: false,
    sourcemap: true,
    rollupOptions: {
      // crxjs only bundles pages referenced by the manifest; the
      // onboarding page is opened programmatically on install.
      input: { onboarding: 'src/onboarding/onboarding.html' },
    },
  },
});
