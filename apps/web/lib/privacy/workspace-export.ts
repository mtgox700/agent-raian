/**
 * The full export of a workspace (RGPD art. 15 and 20): everything the
 * customer entrusted to Phantera, in a ZIP holding one JSON file (all of it,
 * machine readable) and one CSV per table (for a spreadsheet).
 *
 * Never exported: secrets (OAuth tokens, SMTP passwords, API keys), which
 * are ours to protect and useless outside; Stripe identifiers are kept, they
 * are the customer's own references.
 *
 * Built in the background (lib/inngest/workspace-export), kept 7 days in
 * WorkspaceExport, downloaded through a signed link that expires with it
 * and still requires a session allowed to export (app/api/workspace/export).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { strToU8, zipSync } from 'fflate'
import type { PrismaClient } from '@prisma/client'
import { toCsv, type CsvValue } from '@/lib/export/csv'

export const EXPORT_TTL_DAYS = 7
/** Requests per workspace per day. */
export const EXPORTS_PER_DAY = 3
/** Above this, the archive is refused (stored in Postgres): ask support. */
export const EXPORT_MAX_BYTES = 200 * 1024 * 1024
/** A job still PENDING after this was lost (killed, never delivered). */
export const EXPORT_STALE_MS = 30 * 60 * 1000

type Row = Record<string, unknown>

/** What goes into the export, table by table, without any secret column. */
export async function collectWorkspaceData(db: PrismaClient, workspaceId: string): Promise<Record<string, Row[]>> {
  const leadWhere = { lead: { workspaceId } }
  const [workspace, members, campaigns, steps, leads, enrichments, sends, replies, touches, mailboxes, channels, notifications, audit] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        id: true, name: true, plan: true, stripeCustomerId: true, stripeSubscriptionId: true, stripeCurrentPeriodEnd: true,
        targetIndustry: true, targetCompanySize: true, sendingDomain: true, emailSignature: true, onboardingCompleted: true,
        requireTwoFactor: true, createdAt: true, updatedAt: true,
      },
    }),
    db.workspaceMember.findMany({ where: { workspaceId }, select: { role: true, createdAt: true, user: { select: { email: true, name: true } } } }),
    db.campaign.findMany({ where: { workspaceId } }),
    db.campaignEmailStep.findMany({ where: { campaign: { workspaceId } } }),
    db.lead.findMany({ where: { workspaceId } }),
    db.leadEnrichment.findMany({ where: leadWhere }),
    db.emailSend.findMany({ where: { campaign: { workspaceId } } }),
    db.emailReply.findMany({ where: { campaign: { workspaceId } } }),
    db.leadTouch.findMany({ where: { workspaceId } }),
    db.connectedMailbox.findMany({
      where: { workspaceId },
      select: { id: true, provider: true, email: true, displayName: true, status: true, isDefault: true, dailyCap: true, warmupEnabled: true, sharedWithTeam: true, sendAsAliases: true, createdAt: true },
    }),
    db.connectedChannel.findMany({
      where: { workspaceId },
      select: { id: true, provider: true, label: true, status: true, isDefault: true, sharedWithTeam: true, createdAt: true },
    }),
    db.notification.findMany({ where: { workspaceId } }),
    db.auditEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } }),
  ])
  return {
    workspace: [workspace],
    members: members.map((m) => ({ email: m.user.email, name: m.user.name, role: m.role, joinedAt: m.createdAt })),
    campaigns, campaign_steps: steps, leads, lead_enrichments: enrichments,
    email_sends: sends, email_replies: replies, touches, mailboxes, channels, notifications, audit_events: audit,
  }
}

function cell(value: unknown): CsvValue {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return value as CsvValue
}

/** One CSV per table; columns are the union of the rows' keys. */
export function tableToCsv(rows: Row[]): string {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return toCsv(headers, rows.map((r) => headers.map((h) => cell(r[h]))))
}

export function buildExportArchive(data: Record<string, Row[]>, now = new Date()): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'phantera-export.json': strToU8(JSON.stringify({ exportedAt: now.toISOString(), format: 1, data }, null, 2)),
    'LISEZMOI.txt': strToU8([
      'Export complet de votre espace Phantera.',
      'phantera-export.json : toutes les données, lisibles par une machine.',
      'csv/ : une table par fichier, séparateur point-virgule, UTF-8 (Excel).',
      'Les secrets (jetons de connexion, mots de passe, clés API) ne sont jamais exportés.',
      '',
    ].join('\r\n')),
  }
  for (const [name, rows] of Object.entries(data)) files[`csv/${name}.csv`] = strToU8(tableToCsv(rows))
  return zipSync(files, { level: 6, mtime: now })
}

// ─── Signed download link ────────────────────────────────────────────────────

function signingKey(): Buffer {
  const root = process.env.ENCRYPTION_KEY
  if (!root) throw new Error('ENCRYPTION_KEY env var is not set')
  return createHmac('sha256', Buffer.from(root, 'hex')).update('phantera/workspace-export/v1').digest()
}

function signature(exportId: string, expiresAt: Date): string {
  return createHmac('sha256', signingKey()).update(`${exportId}.${expiresAt.getTime()}`).digest('base64url')
}

export function signedExportPath(exportId: string, expiresAt: Date): string {
  return `/api/workspace/export/${exportId}?e=${expiresAt.getTime()}&s=${signature(exportId, expiresAt)}`
}

/** True when the link was issued by us for this export and has not expired. */
export function verifyExportLink(exportId: string, expiresAt: Date, e: string | null, s: string | null, now = new Date()): boolean {
  if (!e || !s || Number(e) !== expiresAt.getTime() || expiresAt <= now) return false
  const expected = Buffer.from(signature(exportId, expiresAt))
  const given = Buffer.from(s)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
