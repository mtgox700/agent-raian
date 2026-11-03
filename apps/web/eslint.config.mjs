/**
 * ESLint flat-config (minimal, ESLint 9).
 *
 * Note: eslint-config-next@16 is currently incompatible with FlatCompat due
 * to a circular plugin reference. Until that is fixed upstream, we ship a
 * minimal config that catches real bugs without the Next presets.
 *
 * Follow-up Trello ticket: migrate to next/core-web-vitals once compatible.
 */
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import nextPlugin from '@next/eslint-plugin-next'

export default [
  // Globally ignored paths
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'next-env.d.ts',
      'public/**',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
      'prisma.config.ts',
      // Test files: own conventions (vi.hoisted creates "before-init" patterns)
      '**/*.test.ts',
      '**/*.spec.ts',
    ],
  },

  // ECMAScript recommended baseline
  js.configs.recommended,

  // Project-wide language options + tuning
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType:  'module',
      globals: {
        // Browser
        window:   'readonly',
        document: 'readonly',
        console:  'readonly',
        fetch:    'readonly',
        Request:  'readonly',
        Response: 'readonly',
        Headers:  'readonly',
        URL:      'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob:     'readonly',
        File:     'readonly',
        // Timers (shared)
        setTimeout:    'readonly',
        clearTimeout:  'readonly',
        setInterval:   'readonly',
        clearInterval: 'readonly',
        // Node
        process:  'readonly',
        Buffer:   'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global:   'readonly',
        // Browser timing
        performance:   'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame:  'readonly',
        navigator: 'readonly',
        location:  'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        Element: 'readonly',
        Event:   'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        ReadableStream: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      // Allow unused args/vars starting with _ (common React/TS pattern)
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // We use console.warn/error/info intentionally with structured logger
      'no-console': 'off',
      // Empty catch blocks are fine for "best-effort" patterns
      'no-empty':    ['warn', { allowEmptyCatch: true }],
      // Project allows TS-style imports + JSX
      'no-undef':    'off',  // TS handles this better than ESLint for .ts/.tsx
    },
  },

  // TypeScript / TSX support: adds parser + recommended-non-type-checked rules
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['**/*.ts', '**/*.tsx'],
  })),

  // Project tuning for TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // TS handles this via tsconfig strict
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Empty interfaces are sometimes used for future extensibility
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // React hooks + Next.js rules, loaded as plain plugins (no FlatCompat).
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      '@next/next':  nextPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks':  'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-img-element':   'warn',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
]
