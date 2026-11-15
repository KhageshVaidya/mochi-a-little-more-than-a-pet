import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/desktop/src/main/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // Some simulation tests validate every synthetic record (~5 s alone); allow headroom under parallel load.
    testTimeout: 30_000,
  },
});
