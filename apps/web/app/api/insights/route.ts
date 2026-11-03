/**
 * GET /api/insights?campaignId=  the open alerts the caller may see
 */

import { auth } from '@clerk/nextjs/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { db } from '@/lib/db'
import { listInsights } from '@/lib/insights/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'workspace.read')
  if (!access.ok) return accessDenied(access)
  const campaignId = new URL(req.url).searchParams.get('campaignId') ?? undefined
  return listInsights(db, access.ctx, campaignId)
}
