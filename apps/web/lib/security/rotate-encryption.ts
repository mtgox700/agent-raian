/**
 * Re-encrypts every secret stored at rest under the current key
 * (lib/security/crypto). Idempotent: a value already under the current key
 * is left alone, and each write is conditional on the value it read, so a
 * value changed meanwhile (a token refresh) is never overwritten with an
 * older one. Safe to run while the application serves traffic, and again.
 *
 * Secrets at rest:
 *   ConnectedMailbox.accessTokenEnc / refreshTokenEnc / smtpPasswordEnc
 *   Workspace.smsSettings.apiKeyEnc (JSON)
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { currentKeyId, keyIdOf, reencrypt } from './crypto'

export interface RotationReport {
  currentKey: string
  scanned: number
  reencrypted: number
  skippedConcurrent: number
  failed: Array<{ table: string; id: string; field: string; error: string }>
  /** Values per key id after the run (dry run: before). */
  byKey: Record<string, number>
}

const MAILBOX_FIELDS = ['accessTokenEnc', 'refreshTokenEnc', 'smtpPasswordEnc'] as const
type MailboxField = (typeof MAILBOX_FIELDS)[number]

const BATCH = 200

export async function rotateEncryption(db: PrismaClient, opts: { dryRun?: boolean } = {}): Promise<RotationReport> {
  const report: RotationReport = { currentKey: currentKeyId(), scanned: 0, reencrypted: 0, skippedConcurrent: 0, failed: [], byKey: {} }
  const count = (value: string) => { const id = keyIdOf(value); report.byKey[id] = (report.byKey[id] ?? 0) + 1 }

  // ── Mailboxes ──
  let cursor: string | undefined
  for (;;) {
    const rows = await db.connectedMailbox.findMany({
      take: BATCH, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: 'asc' },
      select: { id: true, accessTokenEnc: true, refreshTokenEnc: true, smtpPasswordEnc: true },
    })
    if (rows.length === 0) break
    cursor = rows[rows.length - 1].id
    for (const row of rows) {
      for (const field of MAILBOX_FIELDS) {
        const value = row[field]
        if (!value) continue
        report.scanned++
        await rotateOne(report, { table: 'ConnectedMailbox', id: row.id, field, value, dryRun: opts.dryRun, count, write: async (next) => {
          const done = await db.connectedMailbox.updateMany({ where: { id: row.id, [field]: value } as Prisma.ConnectedMailboxWhereInput, data: { [field]: next } as Record<MailboxField, string> })
          return done.count === 1
        } })
      }
    }
  }

  // ── SMS settings (JSON) ──
  const workspaces = await db.workspace.findMany({ select: { id: true, smsSettings: true } })
  for (const ws of workspaces) {
    const settings = ws.smsSettings as Record<string, unknown> | null
    const value = typeof settings?.apiKeyEnc === 'string' ? settings.apiKeyEnc : null
    if (!value) continue
    report.scanned++
    await rotateOne(report, { table: 'Workspace', id: ws.id, field: 'smsSettings.apiKeyEnc', value, dryRun: opts.dryRun, count, write: async (next) => {
      // One conditional statement: only this key changes, and only if it is
      // still the value read (a concurrent edit of the settings is kept).
      const changed = await db.$executeRaw`
        UPDATE "Workspace"
        SET "smsSettings" = jsonb_set("smsSettings"::jsonb, '{apiKeyEnc}', to_jsonb(${next}::text))
        WHERE "id" = ${ws.id} AND "smsSettings"->>'apiKeyEnc' = ${value}`
      return changed === 1
    } })
  }
  return report
}

async function rotateOne(
  report: RotationReport,
  item: { table: string; id: string; field: string; value: string; dryRun?: boolean; count: (v: string) => void; write: (next: string) => Promise<boolean> },
): Promise<void> {
  try {
    const { value: next, changed } = reencrypt(item.value)
    if (!changed || item.dryRun) { item.count(item.value); return }
    if (await item.write(next)) {
      report.reencrypted++
      item.count(next)
    } else {
      report.skippedConcurrent++
    }
  } catch (err) {
    item.count(item.value)
    report.failed.push({ table: item.table, id: item.id, field: item.field, error: err instanceof Error ? err.message : String(err) })
  }
}
