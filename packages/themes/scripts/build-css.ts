/**
 * Writes apps/front/app/themes.generated.css from the themes.
 *   tsx scripts/build-css.ts           write
 *   tsx scripts/build-css.ts --check   fail when out of date
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { buildCss } from '../src/css'
import { Theme } from '../src/index'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'front', 'app', 'themes.generated.css')
const next = buildCss()

if (process.argv.includes('--check')) {
  let current = ''
  try { current = readFileSync(out, 'utf8') } catch { /* missing = out of date */ }
  if (current !== next) {
    console.error('themes.generated.css is out of date: run `npm run build --workspace=@phantera/themes`.')
    process.exit(1)
  }
  console.log('themes.generated.css is up to date.')
} else {
  writeFileSync(out, next)
  console.log(`Wrote ${out}`)
}

// JSON Schema for editors ($schema in each theme file).
const schemaFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'theme.schema.json')
const schema = `${JSON.stringify(z.toJSONSchema(Theme), null, 2)}\n`
if (!process.argv.includes('--check')) writeFileSync(schemaFile, schema)
