/**
 * POST /api/insights/:id/snooze  { days: 7 | 30 }  silences one alert
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { db } from '@/lib/db'
import { snoozeInsight } from '@/lib/insights/http'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'workspace.read')
  if (!access.ok) return accessDenied(access)
  const body = await req.json().catch(() => null) as { days?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })
  return snoozeInsight(db, access.ctx, (await params).id, body.days)
}
