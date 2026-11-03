#!/usr/bin/env node
/**
 * Front/back boundary guard for "front" pull requests.
 *
 * A front change (branch `front/*`, or PR label `front`) must not touch the
 * chassis: the API, its business logic, the database or the contract. When
 * the back must change, it goes through its own PR first (contract first).
 *
 * Usage: node scripts/check-front-boundary.mjs <base-ref>
 */

import { execFileSync } from 'node:child_process'

// Chassis: anything here belongs to the back or to the contract.
const CHASSIS = [
  /^apps\/web\/app\/api\//,
  /^apps\/web\/lib\/(?!stores\/|hooks\/|design\/)/,
  /^apps\/web\/prisma\//,
  /^apps\/web\/middleware\.ts$/,
  /^packages\/contract\//,
]

const base = process.argv[2] ?? 'origin/main'
const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
  .split('\n').filter(Boolean)

const offending = changed.filter((f) => CHASSIS.some((re) => re.test(f)))
if (offending.length) {
  console.error('A front PR must not change the chassis (API, lib, database, contract):')
  for (const f of offending) console.error(`  - ${f}`)
  console.error('Open a separate back PR (contract first), then rebase the front on it.')
  process.exit(1)
}
console.log(`Front boundary OK: ${changed.length} file(s) changed, none in the chassis.`)
