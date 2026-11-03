#!/usr/bin/env node
/**
 * A new body for an existing chassis in one command:
 *
 *   node scripts/new-brand.mjs <key> "<Display name>" <domain> [--from <brand>]
 *
 * Creates the brand's data, copied from an existing brand (default: the
 * default one) so it builds at once, then regenerates the registries:
 *   packages/themes/themes/<key>.json            paint (same colours: change them)
 *   packages/content/content/<key>/fr/*.json     texts (name and domain set; the rest TO REWRITE)
 * Then: NEXT_PUBLIC_BRAND=<key> npm run dev:front, and a Vercel front project
 * with that variable (DEPLOY.md). No component, no API change.
 */

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const fromIdx = args.indexOf('--from')
const from = fromIdx >= 0 ? args.splice(fromIdx, 2)[1] : null
const [key, name, domain] = args

if (!key || !name || !domain || !/^[a-z][a-z0-9-]*$/.test(key)) {
  console.error('Usage: node scripts/new-brand.mjs <key> "<Display name>" <domain> [--from <brand>]')
  console.error('  key: lowercase letters, digits, dashes (e.g. acme)')
  process.exit(1)
}

const themesDir = join(root, 'packages/themes/themes')
const contentDir = join(root, 'packages/content/content')
const source = from ?? JSON.parse(execFileSync('node', ['-e',
  `const fs=require('fs');for(const f of fs.readdirSync(${JSON.stringify(themesDir)})){if(!f.endsWith('.json'))continue;const t=JSON.parse(fs.readFileSync(${JSON.stringify(themesDir)}+'/'+f,'utf8'));if(t.default){console.log(JSON.stringify(t.key))}}`,
], { encoding: 'utf8' }))

if (existsSync(join(themesDir, `${key}.json`))) { console.error(`Brand "${key}" already exists.`); process.exit(1) }
if (!existsSync(join(themesDir, `${source}.json`))) { console.error(`Source brand "${source}" not found.`); process.exit(1) }

// Paint: same variables as the source (the lockstep test requires them all).
const theme = JSON.parse(readFileSync(join(themesDir, `${source}.json`), 'utf8'))
delete theme.default
theme.key = key
theme.name = name
theme.domains = [domain, `www.${domain}`]
writeFileSync(join(themesDir, `${key}.json`), `${JSON.stringify(theme, null, 2)}\n`)

// Texts: copy, then set what we know for sure.
cpSync(join(contentDir, source), join(contentDir, key), { recursive: true, filter: (p) => !p.endsWith('NOTES.md') })
const identityFile = join(contentDir, key, 'fr', 'identity.json')
const identity = JSON.parse(readFileSync(identityFile, 'utf8'))
const sourceName = identity.name
identity.name = name
identity.domain = domain
identity.url = `https://www.${domain}`
identity.supportEmail = `contact@${domain}`
identity.legal = { companyName: name }
identity.seo.titleTemplate = `%s | ${name}`
if (identity.seo.twitterHandle) delete identity.seo.twitterHandle
writeFileSync(identityFile, `${JSON.stringify(identity, null, 2)}\n`)

writeFileSync(join(contentDir, key, 'NOTES.md'), `# ${name}: brand data to finish

Created by scripts/new-brand.mjs from "${source}". Before any deployment:

- [ ] packages/themes/themes/${key}.json: the colours are still ${source}'s.
- [ ] packages/content/content/${key}/fr/*.json: every text except name and domain is still ${sourceName}'s.
- [ ] identity.json → legal: company name, legal form, SIREN, address (legal pages).
- [ ] Logo: components/brand (a mark for "${key}").
`)

for (const [cmd, cmdArgs] of [['node', ['scripts/sync-brands.mjs']], ['npm', ['run', 'themes']]]) {
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit' })
}
console.log(`\n✅ Brand "${key}" created from "${source}". Next: packages/content/content/${key}/NOTES.md`)
console.log(`   Try it: NEXT_PUBLIC_BRAND=${key} npm run dev:front`)
