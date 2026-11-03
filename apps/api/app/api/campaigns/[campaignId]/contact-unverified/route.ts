/**
 * POST /api/campaigns/[campaignId]/contact-unverified
 *
 * Explicit user opt-in: send step 1 to the campaign's qualified leads whose
 * email could NOT be verified (status unknown, typically catch-all domains).
 * Addresses verified as invalid are never sent, even on opt-in: they are a
 * guaranteed hard bounce and burn the sender domain. Uncertain ones are held
 * out of the automatic send to protect sender reputation; this endpoint is
 * triggered by the "Contacter quand même" action after the user accepts the
 * risk via the notification / campaign page.
 *
 * Auth: Clerk user must own the workspace that owns the campaign.
 * Returns: { sent, attempted }
 */

import { auth } from '@clerk/nextjs/server'
import { SENDABLE_BADGES } from '@/lib/leads/badges'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendStep1ToLeads } from '@/lib/pipeline/send-campaign-step1'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { seesCampaign } from '@/lib/auth/scope'
import { getClientKey, tooManyRequests } from '@/lib/security/rate-limit'
import { limit } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteParams {
  params: Promise<{ campaignId: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const rl = await limit(getClientKey(req, userId), { windowSec: 60, max: 3, scope: 'campaign:contact-unverified' })
  if (!rl.allowed) return tooManyRequests(rl, 3) as NextResponse

  const { campaignId } = await params

  const campaign = await db.campaign.findUnique({
    where:  { id: campaignId },
    select: { workspaceId: true, ownerUserId: true, status: true },
  })
  if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

  const workspaceAccess = await requireAccess(userId, 'campaign.launch', { workspaceId: campaign.workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  if (!seesCampaign(workspace, campaign)) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

  const firstStep = await db.campaignEmailStep.findFirst({
    where: { campaignId, position: 0 }, select: { id: true },
  })
  if (campaign.status !== 'ACTIVE' || !firstStep) {
    return NextResponse.json({ error: 'Campagne inactive ou sans séquence' }, { status: 400 })
  }

  // Qualified leads with an UNCERTAIN email (unknown), still contactable.
  // sendStepToLead is idempotent, so any already-sent ones are skipped safely.
  const uncertain = await db.lead.findMany({
    where: {
      campaignId,
      scoreBadge:   { in: [...SENDABLE_BADGES] },
      doNotContact: false,
      enrichment:   { emailStatus: 'unknown' },
    },
    select: { id: true },
    take:   500,
  })

  if (uncertain.length === 0) {
    return NextResponse.json({ success: true, stats: { queued: 0, attempted: 0 } })
  }

  const { queued, attempted } = await sendStep1ToLeads(db, {
    workspaceId: campaign.workspaceId,
    campaignId,
    firstStepId: firstStep.id,
    leadIds:     uncertain.map((l) => l.id),
  })

  return NextResponse.json({ success: true, stats: { queued, attempted } })
}
