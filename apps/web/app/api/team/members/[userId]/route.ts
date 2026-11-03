/**
 * PATCH  /api/team/members/[userId]: changes a member's role.
 * DELETE /api/team/members/[userId]?transferTo=…: removes a member (or lets
 *        the caller leave). With transferTo, their campaigns, mailboxes and
 *        channels go to that admin; without, their campaigns pause.
 *
 * Who may do what is decided in lib/team/rules. Leaving only needs to belong
 * to the workspace.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { deleteUnipileAccount } from '@/lib/multichannel/unipile'
import { changeMemberRole, removeMember, type TeamError } from '@/lib/team/team.service'
import { requireStepUp } from '@/lib/auth/step-up'
import { recordAudit } from '@/lib/audit/audit'

export const runtime = 'nodejs'

type Params = { params: Promise<{ userId: string }> }

const STATUS: Partial<Record<TeamError, number>> = { NOT_ALLOWED: 403, NOT_FOUND: 404, LAST_OWNER: 409, BAD_SUCCESSOR: 422 }

const patchSchema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']) })

export async function PATCH(req: Request, { params }: Params): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'team.manage')
  if (!access.ok) return accessDenied(access)

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 })
  const target = (await params).userId
  const stepUp = await requireStepUp(db, access.ctx, { deny: { action: 'member.role_changed', target: { type: 'user', id: target }, req, details: { role: parsed.data.role } } })
  if (stepUp) return stepUp

  const result = await changeMemberRole(db, access.ctx, { userId: target, role: parsed.data.role })
  if (!result.ok) {
    if (result.error === 'NOT_ALLOWED') {
      await recordAudit(db, access.ctx, { action: 'member.role_changed', target: { type: 'user', id: target }, req, result: 'DENIED', details: { role: parsed.data.role } })
    }
    return NextResponse.json({ error: result.message, code: result.error }, { status: STATUS[result.error] ?? 409 })
  }
  await recordAudit(db, access.ctx, {
    action: 'member.role_changed', target: { type: 'user', id: target }, req,
    details: { from: result.value.previousRole, to: parsed.data.role },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: Params): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'workspace.read')
  if (!access.ok) return accessDenied(access)

  const transferTo = new URL(req.url).searchParams.get('transferTo')
  const target = (await params).userId
  // Leaving is one's own business; removing someone else is a sensitive action.
  if (target !== access.ctx.userId) {
    const stepUp = await requireStepUp(db, access.ctx, { deny: { action: 'member.removed', target: { type: 'user', id: target }, req } })
    if (stepUp) return stepUp
  }
  const result = await removeMember(db, access.ctx, { userId: target, transferToUserId: transferTo || null })
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.error }, { status: STATUS[result.error] ?? 409 })
  await recordAudit(db, access.ctx, {
    action: 'member.removed', target: { type: 'user', id: target }, req,
    details: { left: target === access.ctx.userId, transferred: Boolean(transferTo), pausedCampaigns: result.value.pausedCampaigns },
  })

  for (const accountId of result.value.channelAccounts) {
    await deleteUnipileAccount(accountId).catch((err: unknown) => {
      console.warn('[team/members] unipile revoke failed:', err instanceof Error ? err.message : String(err))
    })
  }
  return NextResponse.json({ ok: true, pausedCampaigns: result.value.pausedCampaigns })
}
