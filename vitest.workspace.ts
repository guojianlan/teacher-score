import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'apps/*/vitest.config.ts',
  // Fallback: any *.test.ts under packages or apps that doesn't have its own config
  {
    test: {
      name: 'packages',
      include: ['packages/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      environment: 'node',
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: 'apps-backend',
      include: ['apps/backend/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      environment: 'node',
      passWithNoTests: true,
    },
  },
]);
