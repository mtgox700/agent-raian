/**
 * POST /api/team/invitations: invites someone by e-mail. The link is sent by
 * e-mail and returned once, so an admin can also share it by hand.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { ipKey, limitAll } from '@/lib/security/shared-rate-limit'
import { inviteMember } from '@/lib/team/team.service'
import { invitationUrl, sendInvitationEmail } from '@/lib/team/invitation-link'
import { recordAudit } from '@/lib/audit/audit'

export const runtime = 'nodejs'

const bodySchema = z.object({
  email: z.string().min(3).max(254),
  role:  z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
})

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'team.manage')
  if (!access.ok) return accessDenied(access)
  const { ctx } = access

  const throttled = await limitAll([
    { key: `ws:${ctx.workspaceId}`, opts: { windowSec: 3600, max: 30, scope: 'team-invite' } },
    { key: `user:${ctx.userId}`, opts: { windowSec: 3600, max: 30, scope: 'team-invite' } },
    { key: ipKey(req), opts: { windowSec: 3600, max: 60, scope: 'team-invite' } },
  ])
  if (!throttled.allowed) return NextResponse.json({ error: 'Trop d’invitations envoyées : réessayez dans une heure.' }, { status: 429 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Adresse ou rôle invalide.' }, { status: 400 })

  const result = await inviteMember(db, ctx, parsed.data)
  if (!result.ok) {
    const status = result.error === 'NOT_ALLOWED' ? 403 : result.error === 'NO_SEAT' ? 402 : 409
    return NextResponse.json({ error: result.message, code: result.error }, { status })
  }

  await recordAudit(db, ctx, { action: 'invitation.sent', target: { type: 'invitation', id: result.value.id }, req, details: { role: parsed.data.role } })

  const url = invitationUrl(result.value.token)
  const [workspace, inviter] = await Promise.all([
    db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { name: true } }),
    db.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } }),
  ])
  let emailSent = true
  try {
    await sendInvitationEmail({
      to:            result.value.email,
      workspaceName: workspace?.name ?? 'Phantera',
      inviterName:   inviter?.name || inviter?.email || 'Un membre de l’équipe',
      role:          parsed.data.role,
      url,
    })
  } catch (err) {
    emailSent = false
    console.error('[team/invitations] e-mail failed:', err instanceof Error ? err.message : String(err))
  }

  return NextResponse.json({ id: result.value.id, email: result.value.email, expiresAt: result.value.expiresAt, url, emailSent })
}
