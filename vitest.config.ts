import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/web'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      exclude: ['**/dist/**', '**/node_modules/**', '**/*.test.ts', '**/*.test.tsx', '**/i18n/es/**'],
    },
  },
});
