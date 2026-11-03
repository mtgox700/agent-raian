/**
 * Secrets never reach a log: every console call made during a test file is
 * scanned (lib/security/secret-patterns), and the file fails if one printed
 * something shaped like a key, a token or one of our ciphertexts. Tests that
 * check the guard itself flag their lines with SECRET_GUARD_SELF_TEST.
 */
import { afterAll } from 'vitest'
import { inspect } from 'node:util'
import { findSecrets } from './lib/security/secret-patterns'

const leaks: string[] = []
const METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const

for (const method of METHODS) {
  const original = console[method].bind(console)
  console[method] = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 4 }))).join(' ')
    const found = line.includes('SECRET_GUARD_SELF_TEST') ? [] : findSecrets(line)
    if (found.length > 0) leaks.push(`console.${method}: ${found.join(', ')}`)
    original(...args)
  }
}

afterAll(() => {
  if (leaks.length > 0) {
    throw new Error(`A secret was written to the logs during this test file:\n${[...new Set(leaks)].join('\n')}`)
  }
})
