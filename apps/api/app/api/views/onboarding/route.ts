/**
 * GET /api/views/onboarding: whether the onboarding page may render for the
 * signed-in user, or where to send them instead (lib/views/onboarding).
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { onboardingView } from '@/lib/views/onboarding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  return NextResponse.json(await onboardingView(db, userId))
}
