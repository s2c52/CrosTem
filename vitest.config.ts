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
  },
});
