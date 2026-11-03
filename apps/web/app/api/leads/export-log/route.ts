/**
 * POST /api/leads/export-log: records a CSV export of leads in the audit
 * log. The file is built in the browser from data the member already sees,
 * so this trace is declarative (marked source: browser) and not a control:
 * the full server-side export of lot D (step-up, signed link) is recorded by
 * the server itself.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/audit'
import { limit } from '@/lib/security/shared-rate-limit'

export const runtime = 'nodejs'

const bodySchema = z.object({
  kind:  z.enum(['leads', 'hot_leads']),
  count: z.number().int().min(0).max(1_000_000),
})

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'lead.export')
  if (!access.ok) return accessDenied(access)

  const throttle = await limit(`user:${access.ctx.userId}`, { windowSec: 60, max: 30, scope: 'export-log' })
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop d’exports : réessayez dans une minute.' }, { status: 429 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  await recordAudit(db, access.ctx, { action: 'data.exported', target: { type: 'leads', id: null }, req, details: { ...parsed.data, source: 'browser' } })
  return NextResponse.json({ ok: true })
}
