/**
 * GET /api/mailbox/senders: the addresses a campaign can be sent from:
 * every mailbox of the workspace with its aliases, and the plan's mailbox
 * quota. Credentials are never selected.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { campaignScope, sendableBy } from '@/lib/auth/scope'
import { mailboxQuota } from '@/lib/email/mailbox-access'
import { parseAliases, providerSupportsAliases } from '@/lib/email/sender-identity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  const workspaceAccess = await requireAccess(userId, 'mailbox.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // For a campaign: the mailboxes serving its owner, whoever looks. Else the
  // caller's own and the shared ones. Seeing a colleague's mailbox in the
  // settings never makes it a sender for your campaigns.
  let ownerUserId = workspace.userId
  const campaignId = new URL(req.url).searchParams.get('campaignId')
  if (campaignId) {
    const campaign = await db.campaign.findFirst({ where: { id: campaignId, ...campaignScope(workspace) }, select: { ownerUserId: true } })
    if (!campaign) return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 })
    ownerUserId = campaign.ownerUserId
  }

  const [mailboxes, quota] = await Promise.all([
    db.connectedMailbox.findMany({
      where:   { workspaceId: workspace.workspaceId, ...sendableBy(ownerUserId) },
      select:  { id: true, provider: true, email: true, displayName: true, status: true, isDefault: true, sendAsAliases: true, aliasesSyncedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    mailboxQuota(db, workspace.workspaceId),
  ])

  return NextResponse.json({
    quota: {
      planName: quota.planName,
      used:     quota.used,
      // JSON has no Infinity: null means unlimited.
      limit:    Number.isFinite(quota.limit) ? quota.limit : null,
    },
    mailboxes: mailboxes.map(({ sendAsAliases, ...mailbox }) => ({
      ...mailbox,
      aliasesSupported: providerSupportsAliases(mailbox.provider),
      aliases:          parseAliases(sendAsAliases),
    })),
  })
}
