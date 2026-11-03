/** DELETE /api/team/invitations/[invitationId]: cancels a pending invitation. */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { revokeInvitation } from '@/lib/team/team.service'
import { recordAudit } from '@/lib/audit/audit'

export const runtime = 'nodejs'

export async function DELETE(req: Request, { params }: { params: Promise<{ invitationId: string }> }): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'team.manage')
  if (!access.ok) return accessDenied(access)

  const invitationId = (await params).invitationId
  const result = await revokeInvitation(db, access.ctx, invitationId)
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 404 })
  await recordAudit(db, access.ctx, { action: 'invitation.revoked', target: { type: 'invitation', id: invitationId }, req })
  return NextResponse.json({ ok: true })
}
