// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest })],
  build: {
    // Default build stays unminified (readable dist for development and
    // Web Store review); the packaged build minifies with Vite 8's
    // built-in oxc (release mode via npm run package). Source maps ship
    // in both — deliberate: the code is GPL and maps help diagnose user
    // reports.
    minify: mode === 'release',
    sourcemap: true,
    rollupOptions: {
      // crxjs only bundles pages referenced by the manifest; the
      // onboarding page is opened programmatically on install.
      input: { onboarding: 'src/onboarding/onboarding.html' },
    },
  },
}));
