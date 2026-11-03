/**
 * GET /api/cron/poll-inboxes
 *
 * Thin wrapper around lib/email/poll-inboxes: kept for Vercel Cron (if the
 * plan supports 5-min schedules) and manual triggering. The PRIMARY schedule
 * is the Inngest `inbox-poller` cron (lib/inngest/inbox-poller.ts): the Vercel
 * crons sat in an ignored vercel.json and never fired (found 2026-07-13).
 * Running both is harmless: reply processing is idempotent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { safeCompare } from '@/lib/security/crypto'
import { pollInboxes } from '@/lib/email/poll-inboxes'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || !safeCompare(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await pollInboxes()
  return NextResponse.json({ ok: true, ...result })
}
