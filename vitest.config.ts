import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom aporta DOMParser/DOM para los tests del parser.
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        // Los fixtures HTML enlazan CSS/JS externos; no hay que descargarlos.
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
