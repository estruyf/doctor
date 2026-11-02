/**
 * ESLint configuration for the project.
 *
 * See https://eslint.style and https://typescript-eslint.io for additional linting options.
 */
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  {
    ignores: ['dist', 'out', 'esbuild.js', 'eslint.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      curly: 'warn',
      '@stylistic/semi': ['warn', 'always'],
      '@typescript-eslint/no-empty-function': 'off',
      // This codebase deliberately uses `any` a lot for dynamic
      // Graph/SharePoint JSON payloads and webview message bodies that
      // aren't worth fully modeling — keep it visible but non-blocking.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
);
