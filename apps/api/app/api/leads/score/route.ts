/**
 * POST /api/leads/score
 *
 * Scores leads via AI (Claude Haiku) against workspace ICP + campaign targeting.
 * Batches 10 leads per AI call. Updates DB with score, badge, reason.
 *
 * Request: { workspaceId, leadIds } (each lead is scored for its own campaign)
 * Response: { success: true, data: { scored, distribution } }
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rescoreLeads } from '@/lib/leads/rescore'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { leadScope } from '@/lib/auth/scope'
import { batchScoreSchema } from '@/lib/types/lead'
import { limitAll } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const parsed = batchScoreSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Sélectionnez entre 1 et 100 leads à scorer.', details: parsed.error.flatten() }, { status: 422 })
  }

  const { workspaceId, leadIds } = parsed.data

  const workspaceAccess = await requireAccess(userId, 'lead.write', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // Up to 10 model calls per request: not repeatable at will.
  const throttle = await limitAll([
    { key: `user:${workspace.userId}`, opts: { windowSec: 3600, max: 30, scope: 'leads-score' } },
    { key: `ws:${workspace.workspaceId}`, opts: { windowSec: 3600, max: 100, scope: 'leads-score' } },
  ])
  if (!throttle.allowed) {
    return NextResponse.json({ error: 'Trop de scorings d’affilée : réessayez dans une heure.' }, { status: 429 })
  }

  // Only the leads this member may see; each is scored against its own
  // campaign's targeting (the button never sent a campaign, so the
  // targeting was always empty).
  const visible = await db.lead.findMany({
    where:  { AND: [{ id: { in: leadIds } }, leadScope(workspace)] },
    select: { id: true },
  })
  if (visible.length === 0) {
    return NextResponse.json({ error: 'Aucun lead trouvé' }, { status: 404 })
  }

  // An explicit request: a priority set by hand is scored again too.
  const { scored, distribution } = await rescoreLeads(db, workspace.workspaceId, visible.map((l) => l.id), { force: true })

  return NextResponse.json({ success: true, data: { scored, distribution } })
}
