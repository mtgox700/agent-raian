/**
 * POST /api/leads/enrich/[leadId]
 *
 * Enriches a single lead via Hunter.io email verification.
 * Creates or updates the LeadEnrichment record.
 *
 * Response: { success: true, data: EnrichResult }
 */

import { auth } from '@clerk/nextjs/server'
import { requestRescore } from '@/lib/inngest/lead-rescore'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { limit } from '@/lib/security/shared-rate-limit'
import { verifyEmail } from '@/lib/services/hunter'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { leadScope } from '@/lib/auth/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ leadId: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { leadId } = await params
  if (!leadId) {
    return NextResponse.json({ error: 'leadId requis' }, { status: 400 })
  }

  const workspaceAccess = await requireAccess(userId, 'lead.write')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const throttle = await limit(`user:${workspace.userId}`, { windowSec: 300, max: 30, scope: 'lead-enrich-one' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop de vérifications : réessayez dans quelques minutes.' }, { status: 429 })

  // Verify lead belongs to this workspace
  const lead = await db.lead.findFirst({
    where: { AND: [{ id: leadId }, leadScope(workspace)] },
    select: { id: true, email: true },
  })
  if (!lead) {
    return NextResponse.json({ error: 'Lead introuvable' }, { status: 404 })
  }

  // Verify email
  let result: Awaited<ReturnType<typeof verifyEmail>>
  try {
    result = await verifyEmail(lead.email)
  } catch (err) {
    console.error('[enrich] Hunter failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'La vérification de l’adresse n’a pas abouti : réessayez.' }, { status: 502 })
  }

  // Upsert enrichment record
  await db.leadEnrichment.upsert({
    where: { leadId: lead.id },
    create: {
      leadId: lead.id,
      emailVerified: result.verified,
      emailConfidence: result.confidence,
      emailStatus: result.status,
      enrichedAt: new Date(),
    },
    update: {
      emailVerified: result.verified,
      emailConfidence: result.confidence,
      emailStatus: result.status,
      enrichedAt: new Date(),
    },
  })

  // The address's reliability is a fifth of the score: score it again.
  await requestRescore(workspace.workspaceId, 'enrichment', [lead.id])

  return NextResponse.json({
    success: true,
    data: {
      leadId: lead.id,
      emailVerified: result.verified,
      emailConfidence: result.confidence,
      emailStatus: result.status,
    },
  })
}
