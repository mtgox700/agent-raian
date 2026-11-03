/**
 * POST /api/onboarding/complete
 *
 * First-run setup: creates the signed-in user's own first workspace when
 * needed, names it and marks onboarding complete (lib/actions/complete-onboarding).
 * No requireAccess: the account may have no workspace yet (lib/auth/public-surfaces).
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { completeOnboarding } from '@/lib/actions/complete-onboarding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await completeOnboarding(userId, body)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}
