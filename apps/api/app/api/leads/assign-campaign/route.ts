/**
 * POST /api/leads/assign-campaign
 *
 * Assigns a batch of leads to a campaign (or unassigns when campaignId is null).
 * Validates workspace ownership for both the leads and the target campaign.
 *
 * Body: { workspaceId, leadIds: string[], campaignId: string | null }
 */

import { auth }       from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z }           from 'zod'
import { db }          from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { campaignScope, leadScope } from '@/lib/auth/scope'
import { queueFirstStep } from '@/lib/sequences/queue-first-step'
import { kickEmailDrip } from '@/lib/inngest/email-drip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  workspaceId: z.string().min(1),
  leadIds:     z.array(z.string().min(1)).min(1).max(500),
  campaignId:  z.string().min(1).nullable(),
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Corps invalide' }, { status: 400 }) }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten() }, { status: 422 })
  }

  const { workspaceId, leadIds, campaignId } = parsed.data

  // Verify workspace ownership
  const workspaceAccess = await requireAccess(userId, 'campaign.write', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // If assigning to a campaign, it must be one the caller runs (or sees as admin)
  let campaignStatus: string | null = null
  if (campaignId) {
    const campaign = await db.campaign.findFirst({
      where: { id: campaignId, ...campaignScope(workspace) },
      select: { id: true, status: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
    campaignStatus = campaign.status
  }

  // Only leads the caller sees: their campaigns' and the shared pool.
  const leads = await db.lead.findMany({
    where: { AND: [{ id: { in: leadIds } }, leadScope(workspace)] },
    select: { id: true },
  })

  if (leads.length === 0) {
    return NextResponse.json({ error: 'Aucun lead trouvé' }, { status: 404 })
  }

  const validIds = leads.map((l) => l.id)

  // Move the leads, and drop what they still had queued in their previous
  // campaign: those rows kept the old campaign from completing until the
  // send step noticed the move.
  const [, result] = await db.$transaction([
    db.emailSend.deleteMany({
      where: {
        leadId: { in: validIds },
        status: 'PENDING',
        ...(campaignId ? { campaignId: { not: campaignId } } : {}),
      },
    }),
    db.lead.updateMany({
      where: { id: { in: validIds }, workspaceId },
      data:  { campaignId },
    }),
  ])

  // A running campaign sends to its new leads right away; before, they waited
  // for a relaunch nobody knew was needed.
  let queued = 0
  if (campaignId && campaignStatus === 'ACTIVE') {
    try {
      const queuedResult = await queueFirstStep(db, { workspaceId, campaignId, leadIds: validIds })
      if (queuedResult.ok) {
        queued = queuedResult.queued
        await kickEmailDrip(`assign:${campaignId}`)
      }
    } catch (err) {
      console.error(`[assign-campaign] queueing failed campaignId=${campaignId}:`, err instanceof Error ? err.message : String(err))
    }
  }

  return NextResponse.json({
    success: true,
    data: { assigned: result.count, campaignId, queued, campaignStatus },
  })
}
