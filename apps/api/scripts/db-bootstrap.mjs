#!/usr/bin/env node
/**
 * Creates the Phantera schema on an EMPTY database (staging, sandbox,
 * disaster recovery).
 *
 * Why: the migration history cannot build a database from scratch (an early
 * migration references a table created by a later baseline), and rewriting
 * already-applied migrations would break production checksums. Instead:
 *   1. refuse unless the target database has no table at all;
 *   2. create the schema from prisma/schema.prisma (prisma db push);
 *   3. mark every migration as applied (prisma migrate resolve), so later
 *      `prisma migrate deploy` runs only the new ones, exactly as in prod.
 *
 * Usage: DATABASE_URL=postgresql://… node scripts/db-bootstrap.mjs
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}
// Prisma writes through DIRECT_URL: it must be the very database we check.
if (process.env.DIRECT_URL && process.env.DIRECT_URL !== url) {
  console.error('Refusing to bootstrap: DIRECT_URL points to another database than DATABASE_URL.')
  process.exit(1)
}
const schema = new URL(url).searchParams.get('schema') ?? 'public'

const client = new pg.Client({ connectionString: url })
await client.connect()
const { rows } = await client.query(
  'select count(*)::int as n from information_schema.tables where table_schema = $1',
  [schema],
)
await client.end()
if (rows[0].n > 0) {
  console.error(`Refusing to bootstrap: schema "${schema}" already has ${rows[0].n} table(s). Use prisma migrate deploy.`)
  process.exit(1)
}

const prisma = (args) => execFileSync('npx', ['prisma', ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DIRECT_URL: url },
  shell: process.platform === 'win32',
})

prisma(['db', 'push', '--skip-generate'])

const migrationsDir = join(root, 'prisma', 'migrations')
const migrations = readdirSync(migrationsDir)
  .filter((name) => statSync(join(migrationsDir, name)).isDirectory())
  .sort()
for (const name of migrations) {
  prisma(['migrate', 'resolve', '--applied', name])
}

console.log(`Bootstrapped: schema created, ${migrations.length} migrations marked as applied.`)
