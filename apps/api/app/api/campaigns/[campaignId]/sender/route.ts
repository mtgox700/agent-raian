/**
 * GET   /api/campaigns/[campaignId]/sender: the campaign's « Envoyer depuis ».
 * PATCH /api/campaigns/[campaignId]/sender: change it.
 * Body: { mailboxId: string | null, fromAlias: string | null } (null mailbox = workspace default)
 *
 * Takes effect from the next email: those already sent keep their sender, and
 * replies keep reaching the mailbox that sent them.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess, type AccessResult } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import type { Permission } from '@/lib/auth/permissions'
import { changeCampaignSender } from '@/lib/campaigns/sender'
import { limit } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ campaignId: string }> }

const bodySchema = z.object({
  mailboxId: z.string().min(1).max(64).nullable(),
  fromAlias: z.string().min(3).max(254).nullable(),
})

async function ownedCampaign(userId: string, campaignId: string, permission: Permission) {
  const access: AccessResult = await requireAccess(userId, permission)
  if (!access.ok) return { access, campaign: null }
  const campaign = await db.campaign.findFirst({
    where:  { id: campaignId, ...campaignScope(access.ctx) },
    select: { id: true, workspaceId: true, ownerUserId: true, connectedMailboxId: true, fromAlias: true, senderLostAt: true },
  })
  return { access, campaign }
}

export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  const { access, campaign } = await ownedCampaign(userId, (await params).campaignId, 'campaign.read')
  if (!access.ok) return accessDenied(access)
  if (!campaign) return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 })
  return NextResponse.json({
    mailboxId:   campaign.connectedMailboxId,
    fromAlias:   campaign.fromAlias,
    senderLost:  Boolean(campaign.senderLostAt),
  })
}

export async function PATCH(req: Request, { params }: Params): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })

  const throttle = await limit(`campaign-sender:${userId}`, { windowSec: 60, max: 20, scope: 'campaign-sender' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop de modifications : réessayez dans une minute.' }, { status: 429 })

  const { access, campaign } = await ownedCampaign(userId, (await params).campaignId, 'campaign.write')
  if (!access.ok) return accessDenied(access)
  if (!campaign) return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  const result = await changeCampaignSender(db, access.ctx, campaign.id, parsed.data, { req })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, mailboxId: result.mailboxId, fromAlias: result.fromAlias })
}
