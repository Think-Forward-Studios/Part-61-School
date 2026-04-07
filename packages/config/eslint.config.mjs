import noBannedTerms from './eslint-rules/no-banned-terms.js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const part61Plugin = { rules: { 'no-banned-terms': noBannedTerms } };

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/*.test.*',
      '**/*.spec.*',
      '.planning/**',
      'supabase/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      part61: part61Plugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    files: [
      'apps/web/**/*.{ts,tsx,jsx}',
      'apps/web/templates/**/*',
      'packages/exports/**/*',
    ],
    plugins: { part61: part61Plugin },
    rules: { 'part61/no-banned-terms': 'error' },
  },
];
