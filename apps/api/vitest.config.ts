import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    include:     ['lib/**/*.{test,spec}.ts', 'app/**/*.{test,spec}.ts'],
    exclude:     ['node_modules', '.next', 'dist'],
    // Fails a test file that prints a secret (lib/security/secret-patterns).
    setupFiles:  ['./vitest.setup.ts'],

    coverage: {
      provider:        'v8',
      reporter:        ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      // Scope to the files this sprint's tests target. As new modules get
      // their own tests, extend this list: never widen without coverage.
      include: [
        'lib/security/rate-limit.ts',
        'lib/utils/email-parser.ts',
        'lib/stripe/sync.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
      ],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  75,
        statements: 80,
      },
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
