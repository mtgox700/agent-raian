/**
 * GET  /api/leads/[leadId]/phone/reveal: lookup state for the lead panel.
 * POST /api/leads/[leadId]/phone/reveal: starts the Apollo phone lookup.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { leadScope } from '@/lib/auth/scope'
import type { Permission } from '@/lib/auth/permissions'
import { REVEAL_ERROR_MESSAGES, displayStatus, remainingReveals, requestPhoneReveal, type RevealError } from '@/lib/phone/apollo-reveal'
import { limit } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'

type Params = { params: Promise<{ leadId: string }> }

const ERROR_STATUS: Partial<Record<RevealError, number>> = {
  LEAD_NOT_FOUND: 404,
  NOT_CONFIGURED: 503,
  APOLLO_ERROR:   502,
}

async function session(permission: Permission) {
  const { userId } = await auth()
  return requireAccess(userId, permission)
}

export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const workspaceAccess = await session('lead.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const { leadId } = await params

  const lead = await db.lead.findFirst({
    where:  { AND: [{ id: leadId }, leadScope(workspace)] },
    select: { phone: true, phoneSource: true, apolloId: true },
  })
  if (!lead) return NextResponse.json({ error: 'Lead introuvable.' }, { status: 404 })
  const reveal = await db.phoneReveal.findUnique({ where: { leadId }, select: { status: true, createdAt: true } })

  return NextResponse.json({
    status:           displayStatus(reveal),
    phone:            lead.phone,
    phoneSource:      lead.phoneSource,
    fromApollo:       Boolean(lead.apolloId),
    remainingMonth:   await remainingReveals(db, workspace.workspaceId),
  })
}

export async function POST(_req: Request, { params }: Params): Promise<NextResponse> {
  const workspaceAccess = await session('phone.reveal')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const { leadId } = await params

  const throttle = await limit(`reveal:${workspace.workspaceId}`, { windowSec: 60, max: 10, scope: 'phone-reveal' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop de recherches d’un coup : réessayez dans une minute.' }, { status: 429 })

  // A paid lookup only on a lead the caller sees.
  const visible = await db.lead.count({ where: { AND: [{ id: leadId }, leadScope(workspace)] } })
  if (visible === 0) return NextResponse.json({ error: REVEAL_ERROR_MESSAGES.LEAD_NOT_FOUND, code: 'LEAD_NOT_FOUND' }, { status: 404 })

  const result = await requestPhoneReveal(db, { workspaceId: workspace.workspaceId, leadId, trigger: 'MANUAL' })
  if (!result.ok) {
    return NextResponse.json(
      { error: REVEAL_ERROR_MESSAGES[result.error], code: result.error },
      { status: ERROR_STATUS[result.error] ?? 409 },
    )
  }
  return NextResponse.json({ ok: true, status: 'PENDING', remainingMonth: await remainingReveals(db, workspace.workspaceId) })
}
