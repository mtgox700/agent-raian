/**
 * GET /api/views/campaigns: data of the Campaigns page (lib/views/campaigns).
 * Without campaign access the page shows an empty list, as before.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAccess } from '@/lib/auth/access'
import { campaignsView, EMPTY_CAMPAIGNS_VIEW } from '@/lib/views/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'campaign.read')
  if (!workspaceAccess.ok) return NextResponse.json(EMPTY_CAMPAIGNS_VIEW)

  return NextResponse.json(await campaignsView(db, workspaceAccess.ctx))
}
