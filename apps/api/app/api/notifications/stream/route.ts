/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events endpoint for real-time notification delivery.
 *
 * Protocol:
 *  - Client connects with ?since=<ISO timestamp>
 *  - Server polls DB every 3s for new notifications since cursor
 *  - Sends each notification as `event: notification` SSE events
 *  - Closes after 20s (Vercel-safe): EventSource reconnects automatically
 *
 * Rate limiting:
 *  - Max 5 connection attempts per user per minute (module-level in-process counter).
 *    NOTE: This is per-instance. For multi-instance production deploys, wire in
 *    Upstash Redis rate limiting instead.
 *
 * Error handling:
 *  - DB errors break the poll loop and close the stream cleanly (client reconnects)
 *  - Genuine errors are surfaced as `event: error` so the client can back off
 */

import { auth }             from '@clerk/nextjs/server'
import { NextResponse }     from 'next/server'
import { limit } from '@/lib/security/shared-rate-limit'
import { db }               from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { notificationScope } from '@/lib/auth/scope'
import type { Prisma } from '@prisma/client'
import { createSSEStream, sleepInterruptible } from '@/lib/sse/stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLL_INTERVAL_MS = 3_000
const SCOPE_REFRESH_MS = 30_000
const MAX_DURATION_MS  = 20_000

// ── Per-user limit, shared by every instance ─────────────────────────────────
// Generous for SSE reconnects (EventSource reconnects every 20s).
const RATE_WINDOW_SEC = 60
const RATE_MAX        = 20

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await limit(`user:${userId}`, { windowSec: RATE_WINDOW_SEC, max: RATE_MAX, scope: 'notifications-stream' })).allowed) {
    return NextResponse.json(
      { error: 'Too many connections: slow down' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const url        = new URL(req.url)
  const sinceParam = url.searchParams.get('since')
  let since        = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000)

  // Guard against invalid date strings
  if (isNaN(since.getTime())) {
    since = new Date(Date.now() - 60_000)
  }

  let scope: Prisma.NotificationWhereInput | null = null
  let scopeReadAt = 0

  return createSSEStream(async (send, signal) => {
    while (!signal.aborted) {
      // Wrap DB call: a transient failure should close this stream cleanly
      // so the client reconnects with a fresh connection rather than fast-looping.
      let rows
      try {
        // Refreshed every 30 s: a campaign created meanwhile brings its own.
        if (!scope || Date.now() - scopeReadAt > SCOPE_REFRESH_MS) {
          scope = await notificationScope(db, workspace)
          scopeReadAt = Date.now()
        }
        rows = await db.notification.findMany({
          where: { AND: [scope, { createdAt: { gt: since } }] },
          orderBy: { createdAt: 'asc' },
          take:    20,
          select:  {
            id: true, type: true, title: true, body: true,
            createdAt: true, readAt: true, leadId: true, campaignId: true,
          },
        })
      } catch (err) {
        // DB error: log and break so the stream closes and client reconnects
        console.error('[notifications/stream] DB query failed:', err)
        break
      }

      if (rows.length > 0) {
        for (const n of rows) {
          send('notification', {
            id:         n.id,
            type:       n.type,
            title:      n.title,
            body:       n.body,
            createdAt:  n.createdAt.toISOString(),
            readAt:     n.readAt?.toISOString() ?? null,
            leadId:     n.leadId,
            campaignId: n.campaignId,
          })
        }
        // Advance cursor so reconnects don't replay
        since = rows[rows.length - 1]!.createdAt
      }

      await sleepInterruptible(POLL_INTERVAL_MS, signal)
    }
  }, MAX_DURATION_MS)
}
