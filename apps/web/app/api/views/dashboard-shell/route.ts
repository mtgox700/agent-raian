/**
 * GET /api/views/dashboard-shell: gate and chrome data of the dashboard
 * layout (lib/views/dashboard-shell). Answers where to send the visitor
 * (pending invitation, onboarding, sign-in on a DB failure) or the workspace
 * shown in the Sidebar.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dashboardShellView } from '@/lib/views/dashboard-shell'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  return NextResponse.json(await dashboardShellView(db, userId))
}
