/**
 * GET /api/views/dashboard: data of the Dashboard home (lib/views/dashboard).
 * Without workspace access the page sends to onboarding, as before:
 * `{ redirect: '/onboarding' }`.
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { dashboardView } from '@/lib/views/dashboard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const [clerkUser, access] = await Promise.all([
    currentUser(),
    requireAccess(userId, 'workspace.read'),
  ])
  if (!access.ok) return NextResponse.json({ redirect: '/onboarding' })

  return NextResponse.json(await dashboardView(access.ctx, clerkUser?.firstName))
}
