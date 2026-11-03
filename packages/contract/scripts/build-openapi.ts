/**
 * Builds packages/contract/openapi.json from the contract.
 *
 *   tsx scripts/build-openapi.ts           write openapi.json
 *   tsx scripts/build-openapi.ts --check   fail if openapi.json is out of date
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOpenApi } from '../src/openapi'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json')
const next = `${JSON.stringify(buildOpenApi(), null, 2)}\n`

if (process.argv.includes('--check')) {
  let current = ''
  try { current = readFileSync(out, 'utf8') } catch { /* missing file = out of date */ }
  if (current !== next) {
    console.error('openapi.json is out of date: run `npm run openapi --workspace=@phantera/contract` and commit it.')
    process.exit(1)
  }
  console.log('openapi.json is up to date.')
} else {
  writeFileSync(out, next)
  console.log(`Wrote ${out}`)
}
