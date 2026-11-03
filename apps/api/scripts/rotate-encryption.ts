/**
 * Re-encrypts every stored secret under the current key (first entry of
 * ENCRYPTION_KEYS). Runbook: .war-room/security/KEY_ROTATION.md.
 *
 *   npx tsx --env-file=<env file> scripts/rotate-encryption.ts --dry-run
 *   npx tsx --env-file=<env file> scripts/rotate-encryption.ts
 *
 * Prints counts only, never a secret. Exits 1 when a value could not be
 * decrypted (a key missing from ENCRYPTION_KEYS): do not drop an old key
 * until a run reports zero values under it.
 */
import { db } from '../lib/db'
import { rotateEncryption } from '../lib/security/rotate-encryption'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const report = await rotateEncryption(db, { dryRun })
  console.log(JSON.stringify({
    dryRun,
    currentKey:        report.currentKey,
    scanned:           report.scanned,
    reencrypted:       report.reencrypted,
    skippedConcurrent: report.skippedConcurrent,
    valuesPerKey:      report.byKey,
    failed:            report.failed.map(({ table, id, field, error }) => ({ table, id, field, error })),
  }, null, 2))
  if (report.failed.length > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1 })
  .finally(() => db.$disconnect())
