/**
 * POST /api/leads/enrich
 *
 * Batch enriches up to 25 leads via Hunter.io email verification.
 * Uses concurrency limit of 3 with 300ms delay between batches.
 *
 * Request: { workspaceId: string, leadIds: string[] }
 * Response: { success: true, data: { results: EnrichResult[], failed: number } }
 */

import { auth } from '@clerk/nextjs/server'
import { requestRescore } from '@/lib/inngest/lead-rescore'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { limitAll } from '@/lib/security/shared-rate-limit'
import { verifyEmailBatch } from '@/lib/services/hunter'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { leadScope } from '@/lib/auth/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const batchEnrichBodySchema = z.object({
  workspaceId: z.string().min(1),
  leadIds: z.array(z.string().min(1)).min(1).max(25),
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
  }

  const parsed = batchEnrichBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten() }, { status: 422 })
  }

  const { workspaceId, leadIds } = parsed.data

  const workspaceAccess = await requireAccess(userId, 'lead.write', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const throttle = await limitAll([
    { key: `user:${workspace.userId}`, opts: { windowSec: 300, max: 10, scope: 'lead-enrich' } },
    { key: `ws:${workspace.workspaceId}`, opts: { windowSec: 3600, max: 60, scope: 'lead-enrich' } },
  ])
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop de vérifications : réessayez dans quelques minutes.' }, { status: 429 })

  // Only leads the caller sees (their campaigns' and the shared pool), and
  // not verified in the last 30 days: a verification costs a Hunter credit.
  const leads = await db.lead.findMany({
    where: { AND: [{ id: { in: leadIds } }, leadScope(workspace), { NOT: { enrichment: { enrichedAt: { gt: new Date(Date.now() - 30 * 86_400_000) } } } }] },
    select: { id: true, email: true },
  })

  if (leads.length === 0) {
    return NextResponse.json({ error: 'Aucun lead trouvé' }, { status: 404 })
  }

  // Batch verify
  const emails = leads.map((l) => l.email)
  const verificationResults = await verifyEmailBatch(emails, { concurrency: 3, delayMs: 300 })

  // Map results back to lead IDs and upsert enrichments
  let failed = 0
  const results: Array<{ leadId: string; emailVerified: boolean; emailConfidence: number; emailStatus: string }> = []

  await Promise.allSettled(
    leads.map(async (lead, i) => {
      const verification = verificationResults[i]
      if (!verification) { failed++; return }

      try {
        await db.leadEnrichment.upsert({
          where: { leadId: lead.id },
          create: {
            leadId: lead.id,
            emailVerified: verification.verified,
            emailConfidence: verification.confidence,
            emailStatus: verification.status,
            enrichedAt: new Date(),
          },
          update: {
            emailVerified: verification.verified,
            emailConfidence: verification.confidence,
            emailStatus: verification.status,
            enrichedAt: new Date(),
          },
        })
        results.push({
          leadId: lead.id,
          emailVerified: verification.verified,
          emailConfidence: verification.confidence,
          emailStatus: verification.status,
        })
      } catch {
        failed++
      }
    })
  )

  // The address's reliability is a fifth of the score: score them again.
  await requestRescore(workspace.workspaceId, 'enrichment', results.map((r) => r.leadId))

  return NextResponse.json({
    success: true,
    data: { results, enriched: results.length, failed },
  })
}
