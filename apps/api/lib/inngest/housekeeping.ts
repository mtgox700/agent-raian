/**
 * Inngest cron: daily housekeeping: retention purges.
 *
 * On Inngest, not Vercel: the Vercel crons sit in apps/api/vercel.json, which
 * Vercel ignores (the root vercel.json is the one deployed, and has none).
 * Each purge is independent: one failing does not stop the others.
 */

import type { PrismaClient } from '@prisma/client'
import { rescoreLeads, unscoredLeads } from '@/lib/leads/rescore'
import { inngest } from './client'
import type { StepLike } from './functions'
import { db } from '@/lib/db'
import { purgeAuditEvents } from '@/lib/audit/audit'
import { purgeRateLimits } from '@/lib/security/shared-rate-limit'
import { EXPORT_STALE_MS } from '@/lib/privacy/workspace-export'
import { purgeDueWorkspaces, type PurgeDeps } from '@/lib/privacy/workspace-deletion'
import { stripe } from '@/lib/stripe/client'
import { deleteUnipileAccount } from '@/lib/multichannel/unipile'
import { decrypt } from '@/lib/security/crypto'

const purgeDeps: PurgeDeps = {
  billing:       stripe as unknown as PurgeDeps['billing'],
  revokeChannel: (accountId) => deleteUnipileAccount(accountId),
  revokeMailbox: revokeGoogleGrant,
}

/**
 * Revokes a Gmail mailbox's grant at Google. Outlook has no equivalent
 * per-token endpoint (Microsoft revokes through the user's account): its
 * refresh token expires unused once deleted here.
 */
async function revokeGoogleGrant(mailbox: { provider: string; refreshTokenEnc: string | null; accessTokenEnc: string }): Promise<void> {
  if (mailbox.provider !== 'GMAIL') return
  const token = decrypt(mailbox.refreshTokenEnc ?? mailbox.accessTokenEnc)
  const res = await fetch('https://oauth2.googleapis.com/revoke', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ token }),
    signal:  AbortSignal.timeout(10_000),
  })
  // 400 invalid_token: already revoked or expired, nothing left to do.
  if (!res.ok && res.status !== 400) throw new Error(`Google revoke answered ${res.status}`)
}

type Purge = { name: string; run: () => Promise<number> }

/** Workspaces whose unscored leads are retried per day (100 leads each at most). */
const UNSCORED_WORKSPACES_PER_DAY = 20

export function housekeepingPurges(client: PrismaClient = db, deps: PurgeDeps = purgeDeps): Purge[] {
  return [
    { name: 'workspaces past their 30 days', run: () => purgeDueWorkspaces(client, deps) },
    { name: 'rate-limit windows', run: () => purgeRateLimits() },
    { name: 'audit events past 13 months', run: () => purgeAuditEvents(client) },
    {
      name: 'workspace exports stuck in preparation',
      run: async () => (await client.workspaceExport.updateMany({
        where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - EXPORT_STALE_MS) } },
        data:  { status: 'FAILED', error: 'stale', completedAt: new Date() },
      })).count,
    },
    {
      // Not a purge: leads whose scoring failed are retried once a day, a
      // few workspaces at a time (each lead costs one model call share).
      name: 'unscored leads scored again',
      run: async () => {
        const workspaces = await client.lead.groupBy({
          by: ['workspaceId'], where: { scoreBadge: 'UNSCORED', doNotContact: false, status: 'new' },
          _count: { _all: true }, orderBy: { _count: { workspaceId: 'desc' } }, take: UNSCORED_WORKSPACES_PER_DAY,
        })
        let scored = 0
        for (const w of workspaces) {
          scored += (await rescoreLeads(client, w.workspaceId, await unscoredLeads(client, w.workspaceId))).scored
        }
        return scored
      },
    },
    {
      name: 'workspace exports past 7 days',
      run: async () => (await client.workspaceExport.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count,
    },
  ]
}

export async function runHousekeeping(purges: Purge[] = housekeepingPurges()): Promise<Record<string, number | string>> {
  const report: Record<string, number | string> = {}
  for (const purge of purges) {
    try {
      report[purge.name] = await purge.run()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[housekeeping] ${purge.name} failed:`, message)
      report[purge.name] = `failed: ${message.slice(0, 200)}`
    }
  }
  return report
}

export const housekeeping = inngest.createFunction(
  {
    id:       'daily-housekeeping',
    name:     'Daily retention purges',
    retries:  2,
    triggers: [{ cron: 'TZ=Europe/Paris 30 3 * * *' }],
  },
  async ({ step }) => (step as unknown as StepLike).run('purges', () => runHousekeeping()),
)
