/**
 * PATCH /api/campaigns/[campaignId]/status
 *
 * Transitions campaign status (lib/campaigns/status: checks, transitions, audit).
 *
 * Body: { action: 'pause' | 'resume' | 'complete', workspaceId: string }
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { changeCampaignStatus } from '@/lib/campaigns/status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  action:      z.enum(['pause', 'resume', 'complete']),
  workspaceId: z.string().min(1),
})

interface RouteParams {
  params: Promise<{ campaignId: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { campaignId } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides', issues: parsed.error.issues }, { status: 422 })
  }

  const { action, workspaceId } = parsed.data

  const workspaceAccess = await requireAccess(userId, 'campaign.launch', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)

  const result = await changeCampaignStatus(db, workspaceAccess.ctx, campaignId, action, { req })
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.reason ? { reason: result.reason } : {}) }, { status: result.status })
  return NextResponse.json({ ok: true, campaign: result.campaign })
}
