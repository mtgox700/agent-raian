#!/usr/bin/env node
/**
 * The factory at a glance: every body (front app) and every brand it can
 * wear, all on one chassis. Usage: npm run bodies
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const contract = read('packages/contract/openapi.json')
const operations = Object.values(contract.paths).reduce((n, ops) => n + Object.keys(ops).length, 0)
const views = Object.keys(contract.paths).filter((p) => p.startsWith('/api/views/')).length

console.log('Chassis  apps/api')
console.log(`         contract: ${operations} operations, ${views} page views (packages/contract/openapi.json)\n`)

const bodies = readdirSync(join(root, 'apps')).filter((a) => a.startsWith('front') && existsSync(join(root, 'apps', a, 'package.json')))
console.log('Bodies (front apps)')
for (const app of bodies) {
  const pkg = read(`apps/${app}/package.json`)
  const port = /-p (\d+)/.exec(pkg.scripts?.dev ?? '')?.[1] ?? '?'
  console.log(`  apps/${app.padEnd(10)} ${pkg.name.padEnd(22)} dev :${port}  ${pkg.description ?? ''}`.slice(0, 160))
}

console.log('\nBrands (any body can wear any brand: NEXT_PUBLIC_BRAND)')
const themesDir = join(root, 'packages/themes/themes')
for (const f of readdirSync(themesDir).filter((x) => x.endsWith('.json')).sort()) {
  const t = read(`packages/themes/themes/${f}`)
  const contentDir = join(root, 'packages/content/content', t.key)
  const locales = existsSync(contentDir) ? readdirSync(contentDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []
  const todo = existsSync(join(contentDir, 'NOTES.md')) && readFileSync(join(contentDir, 'NOTES.md'), 'utf8').includes('- [ ]') ? '  ⚠ NOTES.md has open items' : ''
  console.log(`  ${t.key.padEnd(10)} ${t.name.padEnd(12)} ${t.mode.padEnd(5)} ${(t.domains[0] ?? '').padEnd(22)} locales: ${locales.join(',') || 'none'}${t.default ? '  (default)' : ''}${todo}`)
}
