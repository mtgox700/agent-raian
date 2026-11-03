/**
 * The API contract (packages/contract) and this app must agree:
 *   1. every endpoint of the contract is implemented by a route handler;
 *   2. every route handler is in the contract, or declared as infrastructure;
 *   3. every /api URL the front uses is in the contract;
 *   4. packages/contract/openapi.json is up to date.
 * A front built on the SDK can then trust the contract alone.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { endpoints, INFRA_ROUTES, type EndpointDef } from '@phantera/contract'
import { buildOpenApi } from '@phantera/contract/openapi'

const WEB = join(__dirname, '..', '..')
/** Every body (front app): every /api URL it uses must be in the contract. */
const FRONTS = ['front', 'front-v2'].map((app) => join(WEB, '..', app)).filter((dir) => existsSync(dir))
const ALL = endpoints as readonly EndpointDef[]
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

function walk(dir: string, keep: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full, keep)
    return keep(full) ? [full] : []
  })
}

function exportedMethods(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  return METHODS.filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b`).test(src))
}

/** Route files as `{ path: '/api/leads/[leadId]/status', methods }`. */
const routes = walk(join(WEB, 'app', 'api'), (f) => f.endsWith(`${sep}route.ts`)).map((file) => ({
  path: `/${relative(join(WEB, 'app'), file).split(sep).slice(0, -1).join('/')}`,
  methods: exportedMethods(file),
}))

const isInfra = (path: string) => INFRA_ROUTES.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`))

/** `/api/leads/[leadId]/status` → regex matching `/api/leads/:x/status` */
function pathPattern(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\\?\[[^\]]+\\?\]|\[[^\]]+\]/g, '[^/]+')
  return new RegExp(`^${escaped}$`)
}

describe('API contract', () => {
  it('has unique ids and unique method + path pairs', () => {
    const ids = ALL.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const keys = ALL.map((e) => `${e.method} ${e.path}`)
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
  })

  it('is implemented: every endpoint has a route handler exporting its method', () => {
    const missing = ALL.filter((e) => !routes.some((r) => r.path === e.path && r.methods.includes(e.method)))
      .map((e) => `${e.id}: ${e.method} ${e.path}`)
    expect(missing).toEqual([])
  })

  it('is complete: every non-infrastructure route method is in the contract', () => {
    const missing = routes.filter((r) => !isInfra(r.path)).flatMap((r) =>
      r.methods.filter((m) => !ALL.some((e) => e.path === r.path && e.method === m)).map((m) => `${m} ${r.path}`))
    expect(missing).toEqual([])
  })

  it('covers every /api URL the front uses', () => {
    const frontFiles = FRONTS.flatMap((front) => ['app', 'components', 'hooks', 'lib']
      .flatMap((dir) => walk(join(front, dir), (f) => /\.(ts|tsx)$/.test(f)))).filter((f) => !/\.(test|spec)\.tsx?$/.test(f))

    const patterns = ALL.map((e) => pathPattern(e.path))
    const unknown: string[] = []
    for (const file of frontFiles) {
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const m of src.matchAll(/['"`](\/api\/[^'"`?\s]*)/g)) {
        // `${id}` inside a path is a param; an unclosed `${` at the end starts a query string.
        const url = m[1].replace(/\$\{[^}]*\}/g, 'x').replace(/\$\{.*$/, '').replace(/\/$/, '')
        // '/api' alone is a prefix (robots.txt rule), not a call
        if (url === '/api' || isInfra(url) || patterns.some((p) => p.test(url))) continue
        unknown.push(`${relative(join(WEB, '..'), file)}: ${m[1]}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('openapi.json is up to date (npm run openapi --workspace=@phantera/contract)', () => {
    const file = join(WEB, '..', '..', 'packages', 'contract', 'openapi.json')
    expect(readFileSync(file, 'utf8')).toBe(`${JSON.stringify(buildOpenApi(), null, 2)}\n`)
  })
})
