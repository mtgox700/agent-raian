#!/usr/bin/env node
/**
 * Fails when `npm audit --json` reports a high or critical advisory on a
 * production dependency that is not in the allowlist. Every allowance names
 * the advisory, says why it is not exploitable here, and expires: an expired
 * allowance fails the build, so it is looked at again.
 *
 *   node scripts/check-audit.mjs audit.json security/audit-allowlist.json
 */
import { readFileSync } from 'node:fs'

const [auditPath, allowPath] = process.argv.slice(2)
const audit = JSON.parse(readFileSync(auditPath, 'utf8'))
const allow = JSON.parse(readFileSync(allowPath, 'utf8')).allow ?? []
const today = new Date().toISOString().slice(0, 10)

// Fail closed: a registry outage or an npm error is not a clean report.
if (audit.error || !audit.auditReportVersion || typeof audit.vulnerabilities !== 'object') {
  console.error(`npm audit did not produce a report: ${JSON.stringify(audit.error ?? audit).slice(0, 300)}`)
  process.exit(1)
}
const badDates = allow.filter((a) => !/^\d{4}-\d{2}-\d{2}$/.test(a.expires ?? '') || !a.reason)
if (badDates.length) {
  console.error(`Every allowance needs a reason and an expiry (YYYY-MM-DD): ${badDates.map((a) => a.advisory).join(', ')}`)
  process.exit(1)
}

const BLOCKING = new Set(['high', 'critical'])
const advisories = new Map()
for (const [pkg, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via === 'string' || !BLOCKING.has(via.severity)) continue
    const id = (via.url ?? '').split('/').pop() || `${pkg}:${via.title}`
    advisories.set(id, { id, pkg, severity: via.severity, title: via.title })
  }
}

const failures = []
for (const adv of advisories.values()) {
  const entry = allow.find((a) => a.advisory === adv.id)
  if (!entry) failures.push(`${adv.severity.toUpperCase()} ${adv.id} (${adv.pkg}): ${adv.title}`)
  else if (entry.expires < today) failures.push(`EXPIRED allowance ${adv.id} (${adv.pkg}) since ${entry.expires}: look at it again`)
}
const stale = allow.filter((a) => !advisories.has(a.advisory)).map((a) => a.advisory)

console.log(`High/critical advisories on production dependencies: ${advisories.size}, accepted: ${advisories.size - failures.length}`)
if (stale.length) console.log(`Allowances no longer needed (remove them): ${stale.join(', ')}`)
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
