/** Writes schemas/<doc>.schema.json (JSON Schema for editors and CMS collections). */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { documents } from '../src/schemas'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas')
mkdirSync(dir, { recursive: true })
for (const [name, schema] of Object.entries(documents)) {
  writeFileSync(join(dir, `${name}.schema.json`), `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`)
  console.log(`schemas/${name}.schema.json`)
}
