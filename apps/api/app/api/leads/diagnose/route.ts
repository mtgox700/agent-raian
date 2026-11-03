/**
 * GET /api/leads/diagnose?workspaceId=…
 *
 * Returns counts that explain why a search returned few leads:
 *   - Total leads in workspace (dedup baseline)
 *   - Apollo API key configured / mock mode
 *   - Recent search stats from last 10 leads
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Diagnostics expose configuration: off in production unless switched on
  // for an investigation (ENABLE_DEBUG_ROUTES=1).
  if (process.env.VERCEL_ENV === 'production' && process.env.ENABLE_DEBUG_ROUTES !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

  // Verify ownership
  // A diagnostic of the whole base and of the server config: admins only.
  const access = await requireAccess(userId, 'settings.manage', { workspaceId: workspaceId })
  if (!access.ok) return accessDenied(access)

  // Lead inventory
  const [
    totalLeads,
    leadsFromApollo,
    leadsWithEmail,
    leadsWithVerifiedEmail,
    recentLeads,
  ] = await Promise.all([
    db.lead.count({ where: { workspaceId } }),
    db.lead.count({ where: { workspaceId, source: 'APOLLO' } }),
    db.lead.count({ where: { workspaceId, email: { not: '' } } }),
    db.lead.count({ where: { workspaceId, enrichment: { emailVerified: true } } }),
    db.lead.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
      take:    10,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        company: true, title: true, country: true, source: true,
        apolloId: true, createdAt: true,
        enrichment: { select: { emailVerified: true, emailConfidence: true, emailStatus: true } },
      },
    }),
  ])

  return NextResponse.json({
    workspaceId,
    config: {
      apolloApiKey:   Boolean(process.env.APOLLO_API_KEY),
      hunterApiKey:   Boolean(process.env.HUNTER_API_KEY),
      anthropicKey:   Boolean(process.env.ANTHROPIC_API_KEY),
      mockMode:       !process.env.APOLLO_API_KEY,
    },
    counts: {
      totalLeads,
      leadsFromApollo,
      leadsWithEmail,
      leadsWithVerifiedEmail,
    },
    recentLeads,
    hints: {
      lowResultsCommon: [
        '1. Dedup: leads already saved are skipped (matched by apolloId)',
        '2. Apollo export credits exhausted: enrichment returns null email -> lead skipped',
        '3. q_keywords filter too strict: e.g. "SaaS B2B" matches few records',
        '4. Mock mode: only 15 fixed leads available in dev',
      ],
      fix: [
        'Remove industry filter to broaden results',
        'Try a different country or seniority filter',
        'Check Apollo dashboard for remaining export credits',
      ],
    },
  })
}
