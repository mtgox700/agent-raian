import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The middleware lets server actions through when signed out (an answer it
 * builds cannot be read by Next): each action must check the session itself.
 * This fails as soon as a 'use server' file exports an action that does not.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (name === 'node_modules' || name.startsWith('.')) return []
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

describe('server actions', () => {
  const root = join(__dirname, '..', '..')
  const actions = ['app', 'lib', 'components'].flatMap((d) => files(join(root, d)))
    .filter((f) => /^\s*['"]use server['"]/m.test(readFileSync(f, 'utf8').slice(0, 300)))

  it('there are server action files to check', () => {
    expect(actions.length).toBeGreaterThan(0)
  })

  it.each(actions.map((f) => [f.slice(root.length + 1), f]))('%s: every exported action checks the session', (_name, file) => {
    const src = readFileSync(file, 'utf8')
    const bodies = src.split(/export async function /).slice(1)
    for (const body of bodies) {
      const head = body.slice(0, 1200)
      expect(head, body.slice(0, 40)).toMatch(/await auth\(\)/)
    }
  })
})
