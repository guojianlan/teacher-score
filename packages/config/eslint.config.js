import tseslint from 'typescript-eslint';
import noRawDb from './rules/no-raw-db.js';
import noRawColor from './rules/no-raw-color.js';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**', '**/.next/**', '**/build/**', '**/node_modules/**',
      '**/drizzle/**',
      // 生成 / 配置文件 —— 它们本来就需要 base 色或 hex
      '**/apps/web/src/styles/tokens/__generated.ts',
      '**/apps/web/src/styles/tokens.css',
    ],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      'teacher-score': {
        rules: {
          'no-raw-db': noRawDb,
          'no-raw-color': noRawColor,
        },
      },
    },
    rules: {
      'teacher-score/no-raw-db': 'error',
      'teacher-score/no-raw-color': 'error',
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
  {
    // raw colors / base scales 允许在以下位置：
    //   - tokens 目录（设计系统装配）
    //   - providers.tsx（Chakra theme 配置）
    //   - 任何脚本（migration / build）
    files: [
      '**/apps/web/src/styles/tokens/**',
      '**/apps/web/src/app/providers.tsx',
      '**/scripts/**',
    ],
    rules: {
      'teacher-score/no-raw-color': 'off',
    },
  },
);
