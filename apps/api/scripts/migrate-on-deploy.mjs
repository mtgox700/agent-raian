#!/usr/bin/env node
/**
 * Runs `prisma migrate deploy` during the build, except on Vercel preview
 * deployments: a preview branch carrying a new migration must never apply it
 * to the production database. Set MIGRATE_ON_PREVIEW=1 when previews use
 * their own database (a Neon branch, for instance).
 */

import { execFileSync } from 'node:child_process'

if (process.env.VERCEL_ENV === 'preview' && process.env.MIGRATE_ON_PREVIEW !== '1') {
  console.log('[migrate] Vercel preview: skipping prisma migrate deploy (set MIGRATE_ON_PREVIEW=1 to enable)')
  process.exit(0)
}

execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' })
