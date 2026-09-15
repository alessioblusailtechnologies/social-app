import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Il dominio dell'app, come nel tsconfig.
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    // I test d'integrazione parlano col database del file .env: uno alla volta.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { TZ: 'Europe/Rome' },
  },
});
