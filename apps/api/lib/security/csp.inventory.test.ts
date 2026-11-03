/**
 * The strict policy is chosen by path prefix (lib/security/csp). A new page
 * that needs a session but lives outside those prefixes would silently get
 * the static policy: this test fails instead. A page "needs a session" when
 * it, or a layout above it, calls the access layer or Clerk.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isStrictCspPath } from './csp'

// Pages live in the front (apps/front/app); the policy itself is shared (lib/security/csp).
const APP = join(__dirname, '..', '..', '..', 'front', 'app')
const SESSION = /\b(requireAccess|loadAccess|auth|currentUser)\(|AuthProviders/

/** Source without comments: a comment mentioning AuthProviders proves nothing. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return pages(full)
    return name === 'page.tsx' ? [full] : []
  })
}

/** The URL of a page file: route groups and dynamic segments as they appear. */
function urlOf(file: string): string {
  const parts = relative(APP, file).split(sep).slice(0, -1).filter((p) => !/^\(.*\)$/.test(p))
  return '/' + parts.join('/')
}

/** The page and every layout above it. */
function chain(file: string): string[] {
  const files: string[] = [file]
  let dir = join(file, '..')
  while (dir.startsWith(APP)) {
    const layout = join(dir, 'layout.tsx')
    if (existsSync(layout)) files.push(layout)
    dir = join(dir, '..')
  }
  return files
}

describe('CSP inventory', { timeout: 60_000 }, () => {
  it('every page that needs a session gets the strict policy', () => {
    const offenders = pages(APP)
      .filter((f) => chain(f).some((c) => SESSION.test(code(readFileSync(c, 'utf8')))))
      .map(urlOf)
      .filter((url) => !isStrictCspPath(url))
    expect(offenders).toEqual([])
  })
})
