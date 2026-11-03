/**
 * GET /api/team: the members of the active workspace, and for those who
 * manage the team, the pending invitations. Seats are shown to everyone.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { can } from '@/lib/auth/permissions'
import { listTeam } from '@/lib/team/team.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'workspace.read')
  if (!access.ok) return accessDenied(access)
  const { ctx } = access

  const manages = can(ctx.role, 'team.manage')
  const team = await listTeam(db, ctx.workspaceId, manages)
  return NextResponse.json({
    ...team,
    me: { userId: ctx.userId, role: ctx.role, managesTeam: manages },
  })
}
