import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The middleware lets server actions through when signed out (an answer it
 * builds cannot be read by Next). The front now reaches the back through the
 * API routes only (packages/contract), which the middleware and each handler
 * guard: a new 'use server' file would bypass that, so none may come back.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (name === 'node_modules' || name.startsWith('.')) return []
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

describe('server actions', () => {
  // Both apps: the chassis (apps/api) and the front (apps/front).
  const root = join(__dirname, '..', '..', '..')
  const actions = ['api/app', 'api/lib', 'front/app', 'front/lib', 'front/components']
    .filter((d) => existsSync(join(root, d)))
    .flatMap((d) => files(join(root, d)))
    .filter((f) => /^\s*['"]use server['"]/m.test(readFileSync(f, 'utf8').slice(0, 300)))

  it('none is left: mutations go through the API contract', () => {
    expect(actions.map((f) => f.slice(root.length + 1))).toEqual([])
  })
})
