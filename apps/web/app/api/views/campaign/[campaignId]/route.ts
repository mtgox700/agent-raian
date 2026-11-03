/**
 * GET /api/views/campaign/[campaignId]: data of the Campaign detail page
 * (lib/views/campaign).
 *
 * Without campaign access the answer is `{ redirectTo: '/onboarding' }`: the
 * page redirects there, as before. An unknown campaign, or one outside the
 * member's scope, is a 404: the page shows notFound().
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAccess } from '@/lib/auth/access'
import { campaignView } from '@/lib/views/campaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { campaignId } = await params

  const workspaceAccess = await requireAccess(userId, 'campaign.read')
  if (!workspaceAccess.ok) return NextResponse.json({ redirectTo: '/onboarding' })

  const view = await campaignView(db, workspaceAccess.ctx, campaignId)
  if (!view) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

  return NextResponse.json(view)
}
