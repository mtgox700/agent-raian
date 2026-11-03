import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { existsSync } from 'node:fs'

const LIB_DIRS = [path.resolve(__dirname, 'lib'), path.resolve(__dirname, '../api/lib')]
const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

function resolveLib(source: string): string | null {
  for (const dir of LIB_DIRS) for (const ext of EXTS) {
    const file = path.join(dir, source + ext)
    if (existsSync(file) && !file.endsWith(path.sep)) return file
  }
  return null
}

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    include:     ['lib/**/*.{test,spec}.ts', 'app/**/*.{test,spec}.ts', 'components/**/*.{test,spec}.{ts,tsx}'],
    exclude:     ['node_modules', '.next', 'dist'],
    // Fails a test file that prints a secret (lib/security/secret-patterns).
    setupFiles:  ['./vitest.setup.ts'],
  },

  resolve: {
    // Same lookup as tsconfig paths: the front's own lib first, then the chassis' shared lib.
    alias: [
      { find: /^@\/lib\/(.*)$/, replacement: '$1', customResolver: resolveLib },
      { find: '@', replacement: path.resolve(__dirname, '.') },
    ],
  },
})
