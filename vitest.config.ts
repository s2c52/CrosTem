// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom provides DOMParser/DOM for the parser tests.
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        // The HTML fixtures link external CSS/JS; they must not be downloaded.
        settings: {
          disableCSSFileLoading: true,
          disableJavaScriptFileLoading: true,
          disableJavaScriptEvaluation: true,
        },
      },
    },
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'html'],
    },
  },
});
