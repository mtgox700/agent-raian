/**
 * Every server entry point either goes through the access layer, handler by
 * handler, or is declared in PUBLIC_SURFACES with the guard it relies on.
 * Adding a route that skips both fails here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLIC_SURFACES } from './public-surfaces'

const ROOT = join(__dirname, '..', '..')
const ACCESS_CALL = /\b(requireAccess|loadAccess)\(/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const rel = (file: string) => relative(ROOT, file).split(sep).join('/')
const appFiles = walk(join(ROOT, 'app')).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))

const routes = appFiles.filter((f) => f.endsWith('route.ts'))
const serverActions = appFiles.filter((f) => /^['"]use server['"]/m.test(readFileSync(f, 'utf8')))
const dataPages = appFiles.filter((f) => /(page|layout)\.tsx$/.test(f) && readFileSync(f, 'utf8').includes("from '@/lib/db'"))

/** Source without comments, so a comment mentioning requireAccess( proves nothing. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/**
 * Top-level chunks: functions (exported or local) and exported consts
 * (`export const POST = async () => …`). Each runs to the next top-level
 * declaration, so code after a guarded handler is never credited to it.
 */
function chunks(source: string) {
  const re = /^(export\s+)?(default\s+)?(?:(async\s+)?function\s+(\w+)|const\s+(\w+)\s*=)/gm
  const starts = [...source.matchAll(re)].map((m) => ({ index: m.index ?? 0, exported: Boolean(m[1]), name: m[4] ?? m[5] }))
  return starts.map((s, i) => ({ ...s, body: source.slice(s.index, starts[i + 1]?.index ?? source.length) }))
}

/** Handlers that come from elsewhere cannot be checked here: they must be declared. */
const REEXPORT = /^export\s+(\{[^}]*\}|\*)\s+from\s+/m

/** Exported handlers that reach data without the access layer (directly or via a local guard function). */
function unguardedHandlers(source: string, kind: 'route' | 'action' | 'page'): string[] {
  const all = chunks(source)
  const guards = new Set(all.filter((c) => !c.exported && ACCESS_CALL.test(c.body)).map((c) => c.name))
  const isHandler = (c: (typeof all)[number]) =>
    c.exported && (kind === 'route'
      ? /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(c.name)
      : !/^(runtime|dynamic|revalidate|metadata|maxDuration|fetchCache|preferredRegion)$/.test(c.name))
  return all
    .filter(isHandler)
    .filter((c) => !ACCESS_CALL.test(c.body) && ![...guards].some((g) => new RegExp(`\\b${g}\\(`).test(c.body)))
    .map((c) => c.name)
}

// Reads every source file: slow on a cold disk, so a generous timeout.
describe('access inventory', { timeout: 60_000 }, () => {
  it('finds the surfaces it checks', () => {
    expect(routes.length).toBeGreaterThan(60)
    // The front reaches the back through the API only: no server action is left.
    expect(serverActions.map(rel)).toEqual([])
  })

  it('every route handler, server action and data page goes through the access layer or is declared public', () => {
    const offenders: string[] = []
    const check = (file: string, kind: 'route' | 'action' | 'page') => {
      const path = rel(file)
      const source = code(readFileSync(file, 'utf8'))
      const declared = PUBLIC_SURFACES[path]
      if (declared) {
        if (declared.guard && !source.includes(declared.guard)) offenders.push(`${path}: declared guard "${declared.guard}" missing`)
        return
      }
      if (REEXPORT.test(source)) offenders.push(`${path}: re-exported handlers cannot be checked`)
      for (const name of unguardedHandlers(source, kind)) offenders.push(`${path}: ${name} without requireAccess`)
    }
    routes.forEach((f) => check(f, 'route'))
    serverActions.forEach((f) => check(f, 'action'))
    dataPages.forEach((f) => check(f, 'page'))
    expect(offenders).toEqual([])
  })

  it('the detector itself catches the bypasses it is meant to catch', () => {
    const arrow = "export const POST = async () => { return db.lead.findMany() }"
    const commented = [
      'export async function GET() {',
      "  // requireAccess(userId, 'x')",
      '  return db.lead.findMany()',
      '}',
    ].join('\n')
    const guarded = [
      'async function session(p) { return requireAccess(u, p) }',
      "export async function GET() { const a = await session('lead.read') }",
    ].join('\n')
    expect(unguardedHandlers(code(arrow), 'route')).toEqual(['POST'])
    expect(unguardedHandlers(code(commented), 'route')).toEqual(['GET'])
    expect(unguardedHandlers(code(guarded), 'route')).toEqual([])
    expect(REEXPORT.test("export { GET } from './other'")).toBe(true)
  })

  it('declares no public surface that no longer exists', () => {
    const existing = new Set(appFiles.map(rel))
    expect(Object.keys(PUBLIC_SURFACES).filter((p) => !existing.has(p))).toEqual([])
  })

  it('nobody reads workspaces by ownership outside the access layer and first-workspace creation', () => {
    const allowed = new Set([
      'lib/auth/access.ts',
      'lib/actions/complete-onboarding.ts',
      'app/(auth)/onboarding/layout.tsx',
      // Account deletion cancels the subscriptions of the workspaces the person is billed for.
      'lib/stripe/cancel-on-delete.ts',
    ])
    const files = [...appFiles, ...walk(join(ROOT, 'lib')).filter((f) => /\.ts$/.test(f) && !/\.test\./.test(f))]
    const offenders = files.map(rel).filter((p) => !allowed.has(p))
      .filter((p) => /ownedWorkspaces|owner:\s*\{\s*clerkId/.test(readFileSync(join(ROOT, p), 'utf8')))
    expect(offenders).toEqual([])
  })
})
