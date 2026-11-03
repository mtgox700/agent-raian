/**
 * GET /api/leads?workspaceId=xxx[&q=…][&status=…]
 *
 * Leads of a workspace, same rows as the Leads page. With q / status it
 * searches the whole base: the page only loads the best 500, and its search
 * used to stop there (1 472 leads, 232 contacted, 26 found).
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { leadScope } from '@/lib/auth/scope'
import { LEAD_LIST_LIMIT, LEAD_LIST_ORDER, leadSearchWhere, toLeadRow } from '@/lib/leads/lead-rows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_QUERY_LENGTH = 100

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })
  const q = (searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH)
  const status = searchParams.get('status') ?? 'all'

  const workspaceAccess = await requireAccess(userId, 'lead.read', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const where = { AND: [leadScope(workspace), leadSearchWhere(workspaceId, q, status)] }
  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      include: { enrichment: true },
      orderBy: LEAD_LIST_ORDER,
      take: LEAD_LIST_LIMIT,
    }),
    db.lead.count({ where }),
  ])

  return NextResponse.json({ success: true, data: leads.map(toLeadRow), total })
}
