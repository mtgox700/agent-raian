/**
 * GET /api/leads/available?q=…
 *
 * Leads that can start a new campaign from the existing base: not in a
 * campaign, not opted out, scored contactable (FAST_TRACK or NORMAL). Used by
 * the "Base existante" picker of the campaign wizard.
 */

import { auth } from '@clerk/nextjs/server'
import { SENDABLE_BADGES } from '@/lib/leads/badges'
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RESULTS = 500
const MAX_QUERY_LENGTH = 100

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH)

  const workspaceAccess = await requireAccess(userId, 'lead.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx
  const { workspaceId } = workspace

  const where: Prisma.LeadWhereInput = {
    workspaceId,
    campaignId:   null,
    doNotContact: false,
    scoreBadge:   { in: [...SENDABLE_BADGES] },
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName:  { contains: q, mode: 'insensitive' } },
            { company:   { contains: q, mode: 'insensitive' } },
            { title:     { contains: q, mode: 'insensitive' } },
            { email:     { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ scoreBadge: 'asc' }, { aiScore: 'desc' }, { createdAt: 'desc' }],
      take:    MAX_RESULTS,
      select:  { id: true, firstName: true, lastName: true, company: true, title: true, aiScore: true, scoreBadge: true },
    }),
    db.lead.count({ where }),
  ])

  return NextResponse.json({ success: true, data: { leads, total } })
}
