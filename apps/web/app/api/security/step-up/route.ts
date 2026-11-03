/**
 * POST /api/security/step-up: answers 200 when the session verified its
 * factors recently (and holds the team's 2FA if required), or Clerk's
 * reverification error. The client calls it through useReverification
 * before a sensitive navigation that cannot carry the dialog itself (the
 * OAuth consent of a mailbox); the destination checks again server-side.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { requireStepUp } from '@/lib/auth/step-up'

export const runtime = 'nodejs'

export async function POST(): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'workspace.read')
  if (!access.ok) return accessDenied(access)
  return (await requireStepUp(db, access.ctx)) ?? NextResponse.json({ ok: true })
}
