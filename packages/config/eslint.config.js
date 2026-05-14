import tseslint from 'typescript-eslint';
import noRawDb from './rules/no-raw-db.js';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/build/**', '**/node_modules/**', '**/drizzle/**'],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      'teacher-score': {
        rules: {
          'no-raw-db': noRawDb,
        },
      },
    },
    rules: {
      'teacher-score/no-raw-db': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // raw db is allowed inside the db package itself, auth package (Better-Auth adapter),
    // and the worker entrypoint
    files: [
      '**/packages/db/**',
      '**/packages/auth/**',
      '**/apps/backend/src/worker.ts',
      '**/apps/backend/src/boss.ts',
      '**/apps/backend/src/db.ts',
    ],
    rules: {
      'teacher-score/no-raw-db': 'off',
    },
  },
);
