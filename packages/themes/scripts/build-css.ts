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

// Every front app gets the same compiled themes (the paint is shared by all bodies).
const apps = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps')
const outs = ['front', 'front-v2'].map((app) => join(apps, app, 'app', 'themes.generated.css'))
const next = buildCss()

if (process.argv.includes('--check')) {
  for (const out of outs) {
    let current = ''
    try { current = readFileSync(out, 'utf8') } catch { /* missing = out of date */ }
    if (current !== next) {
      console.error(`${out} is out of date: run \`npm run themes\`.`)
      process.exit(1)
    }
  }
  console.log('themes.generated.css is up to date in every front.')
} else {
  for (const out of outs) {
    writeFileSync(out, next)
    console.log(`Wrote ${out}`)
  }
}

// JSON Schema for editors ($schema in each theme file).
const schemaFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'theme.schema.json')
const schema = `${JSON.stringify(z.toJSONSchema(Theme), null, 2)}\n`
if (!process.argv.includes('--check')) writeFileSync(schemaFile, schema)
