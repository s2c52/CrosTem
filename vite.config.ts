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
    // built-in oxc (release mode via npm run package). Source maps stay
    // in dev builds only: in the release zip they were ~40% of the
    // package and forced crxjs to list every *.js.map as a
    // web-accessible resource (stable fingerprinting URLs). Any tagged
    // release can be rebuilt locally with maps to diagnose a user
    // report, and the code remains GPL either way.
    minify: mode === 'release',
    sourcemap: mode !== 'release',
    rollupOptions: {
      // crxjs only bundles pages referenced by the manifest; the
      // onboarding page is opened programmatically on install.
      input: { onboarding: 'src/onboarding/onboarding.html' },
    },
  },
}));
