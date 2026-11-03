#!/usr/bin/env node
/**
 * Phantera: env readiness check.
 *
 * Reads apps/api/.env.local (falling back to process.env) and prints which
 * feature groups are ACTIVE vs BLOCKED based on the keys present. Run after
 * pasting your keys:  npm run setup:check
 *
 * Zero dependencies. Exit code 1 if a TIER-1 (core) variable is missing.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = join(here, '..', '.env.local')

function parseEnv(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const fileEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {}
const env = { ...fileEnv, ...process.env }
const has = (k) => !!(env[k] && String(env[k]).trim().length > 0)
const all = (...keys) => keys.every(has)
const some = (...keys) => keys.some(has)

if (!existsSync(envPath)) {
  console.log('⚠  No .env.local found. Copy the template first:')
  console.log('     cp env.local.template .env.local\n')
}

// [tier, name, satisfied(), detail]
const groups = [
  ['1 CORE', 'Database', () => all('DATABASE_URL'), 'app cannot boot without it'],
  ['1 CORE', 'Auth (Clerk)', () => all('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'), 'required to render the dashboard'],
  ['1 CORE', 'Encryption key', () => has('ENCRYPTION_KEY'), 'needed to store mailbox/OAuth secrets'],
  ['2 LLM', 'AI agents (Ollama)', () => has('OLLAMA_API_KEY'), 'empty → deterministic mocks'],
  ['3 EMAIL', 'Sending (Resend)', () => has('RESEND_API_KEY'), 'empty → console.log mock send'],
  ['3 EMAIL', 'Inbound replies', () => has('INBOUND_WEBHOOK_SECRET'), 'Cloudflare worker → reply classification'],
  ['4 SCALE', 'Durable jobs (Inngest)', () => all('INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'), 'dev works keyless via inngest-cli'],
  ['4 SCALE', 'Redis (Upstash)', () => all('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'), 'empty → in-memory store'],
  ['5 DATA', 'Sourcing (Apollo)', () => has('APOLLO_API_KEY'), 'empty → 15 mock leads'],
  ['5 DATA', 'Enrichment waterfall', () => some('HUNTER_API_KEY', 'PROSPEO_API_KEY', 'FINDYMAIL_API_KEY', 'LEADMAGIC_API_KEY'), 'any one provider activates the waterfall'],
  ['6 CHANNEL', 'Multichannel (Unipile)', () => all('UNIPILE_DSN', 'UNIPILE_API_KEY'), 'LinkedIn + email transport'],
  ['7 BILLING', 'Stripe', () => all('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'), 'usage metering + checkout'],
  ['8 OPS', 'Cron secret', () => has('CRON_SECRET'), 'secures /api/cron/* (daily-digest, poll-inboxes)'],
  ['9 OBS', 'Sentry', () => has('NEXT_PUBLIC_SENTRY_DSN'), 'optional error tracking'],
  ['9 OBS', 'PostHog', () => has('NEXT_PUBLIC_POSTHOG_KEY'), 'optional product analytics'],
]

console.log('Phantera — environment readiness\n' + '='.repeat(48))
let coreMissing = 0
let active = 0
for (const [tier, name, ok, detail] of groups) {
  const isOk = ok()
  if (isOk) active++
  const isCore = tier.startsWith('1')
  if (!isOk && isCore) coreMissing++
  const mark = isOk ? '✅' : isCore ? '❌' : '⚪'
  console.log(`${mark}  [${tier.padEnd(9)}] ${name.padEnd(24)} ${isOk ? 'active' : '—  ' + detail}`)
}
console.log('='.repeat(48))
console.log(`${active}/${groups.length} feature groups active.`)

if (coreMissing > 0) {
  console.log(`\n❌ ${coreMissing} TIER-1 (core) variable group(s) missing — the app will not run until these are set.`)
  process.exit(1)
}
console.log('\n✅ Core is ready — the app can boot. Fill the other tiers to activate more.')
