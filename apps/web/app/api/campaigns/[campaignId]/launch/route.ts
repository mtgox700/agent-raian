/**
 * POST /api/campaigns/[campaignId]/launch
 *
 * Launches a campaign in well under a second, whatever its size: queues
 * step 1 for every qualifying lead, marks the campaign ACTIVE and starts the
 * sending queue (lib/sequences/drip-queue). The emails then leave one by one
 * at the mailbox's own safe rhythm, up to its daily cap; nothing is sent
 * inside this request (a synchronous send of 100 leads hit the 60s function
 * limit before the campaign was marked ACTIVE, and nothing went out).
 *
 * Qualifying leads: scoreBadge IN (FAST_TRACK, NORMAL) AND doNotContact=false
 *   AND step 1 not already queued or sent (a failed one with attempts left is
 *   queued again).
 *
 * Request body: { workspaceId: string }
 * Response:     { success: true, data: { queued, totalSteps, campaignStatus, channel, estimate } }
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DELETION_PENDING_MESSAGE, deletionPending } from '@/lib/privacy/workspace-deletion'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import { launchCampaignSchema } from '@/lib/types/lead'
import { kickEmailDrip } from '@/lib/inngest/email-drip'
import { queueFirstStep } from '@/lib/sequences/queue-first-step'
import { estimateLaunch } from '@/lib/sequences/launch-estimate'
import { SENDER_REQUIRED_MESSAGE } from '@/lib/email/mailbox-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ campaignId: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { campaignId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
  }

  const parsed = launchCampaignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 422 })
  }

  const { workspaceId } = parsed.data

  const workspaceAccess = await requireAccess(userId, 'campaign.launch', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const campaign = await db.campaign.findFirst({
    where:  { id: campaignId, ...campaignScope(workspace) },
    select: { id: true, senderLostAt: true },
  })
  if (!campaign) {
    return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  }
  if (await deletionPending(db, workspace.workspaceId)) {
    return NextResponse.json({ error: DELETION_PENDING_MESSAGE, reason: 'deletion_pending' }, { status: 409 })
  }
  if (campaign.senderLostAt) {
    return NextResponse.json({ error: SENDER_REQUIRED_MESSAGE, reason: 'sender_required' }, { status: 409 })
  }

  try {
    const result = await queueFirstStep(db, { workspaceId, campaignId })
    if (!result.ok) {
      if (result.reason === 'NO_STEP') {
        return NextResponse.json({ error: 'Aucune étape email configurée' }, { status: 400 })
      }
      if (result.reason === 'QUOTA') {
        return NextResponse.json(
          {
            error: `Quota d'envois atteint (${result.quota?.current}/${result.quota?.limit}). Passez au plan supérieur.`,
            quota: result.quota,
          },
          { status: 429 },
        )
      }
      return NextResponse.json(
        { error: 'Aucun nouveau lead qualifié à contacter (FAST_TRACK ou NORMAL requis)' },
        { status: 400 },
      )
    }
    const { queued, firstStep, totalSteps } = result

    await db.campaign.update({
      where: { id: campaignId },
      data:  { status: 'ACTIVE' },
    })

    await kickEmailDrip(`launch:${campaignId}`)

    const estimate = await estimateLaunch(db, {
      workspaceId,
      campaignId,
      channel: firstStep.channel as 'EMAIL' | 'LINKEDIN',
      queued,
    }).catch(() => null)

    return NextResponse.json({
      success: true,
      data: {
        queued,
        totalSteps,
        campaignStatus: 'ACTIVE',
        channel:        firstStep.channel,
        estimate,
      },
    })
  } catch (err: unknown) {
    console.error(`[launch] failed campaignId=${campaignId}:`, err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Le lancement a échoué, réessayez dans un instant.' }, { status: 500 })
  }
}
