/**
 * GET /api/cron/process-sequences
 *
 * Runs every hour via Vercel Cron.
 * For each ACTIVE campaign, advances leads to their next email step when the
 * dayOffset deadline has passed.
 *
 * Secured with CRON_SECRET bearer token (set in Vercel environment variables).
 * Safe to run concurrently: idempotency is enforced at the DB level.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processCampaign } from '@/lib/sequences/process-campaign'
import type { CampaignProcessResult } from '@/lib/sequences/types'
import { flushServerEvents } from '@/lib/analytics/server-events'
import { safeCompare } from '@/lib/security/crypto'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60 // seconds (Vercel Pro required for > 10s)

const MAX_ELAPSED_MS = 50_000 // exit early if approaching timeout

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authorization = req.headers.get('authorization')
  const cronSecret    = process.env.CRON_SECRET

  if (!safeCompare(authorization, cronSecret ? `Bearer ${cronSecret}` : null)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const now       = new Date(startedAt)

  // ── Find all ACTIVE campaigns ────────────────────────────────────────────────
  // Select sentCount + workspace.ownerId.clerkId so we can detect the
  // first-ever email per campaign and fire the activation milestone event.
  const activeCampaigns = await db.campaign.findMany({
    where:  { status: 'ACTIVE' },
    select: {
      id:          true,
      sentCount:   true,
      workspaceId: true,
      workspace:   { select: { owner: { select: { clerkId: true } } } },
    },
    orderBy: { lastProcessedAt: 'asc' }, // process least-recently-processed first
  })

  if (activeCampaigns.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [] })
  }

  const results: CampaignProcessResult[] = []

  // ── Process campaigns sequentially to respect Resend rate limits ─────────────
  for (const campaign of activeCampaigns) {
    // Exit early if we're approaching the function timeout
    if (Date.now() - startedAt > MAX_ELAPSED_MS) {
      console.warn('[sequence-cron] Approaching timeout: deferring remaining campaigns to next run')
      break
    }

    try {
      const result = await processCampaign(db, campaign.id, now)
      results.push(result)

      if (result.queued > 0 || result.completed) {
        console.info(
          `[sequence-cron] campaign=${campaign.id} queued=${result.queued} skipped=${result.skipped} errors=${result.errors} completed=${result.completed}`,
        )
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[sequence-cron] Campaign ${campaign.id} failed:`, message)
      results.push({
        campaignId: campaign.id,
        sent:       0,
        queued:     0,
        skipped:    0,
        errors:     1,
        completed:  false,
      })
    }
  }

  // ── Retry stuck PENDING sends ───────────────────────────────────────────
  // Flush all queued PostHog events before the serverless function suspends
  await flushServerEvents()

  const totalSent     = results.reduce((s, r) => s + r.sent,     0)
  const totalQueued   = results.reduce((s, r) => s + r.queued,   0)
  const totalErrors   = results.reduce((s, r) => s + r.errors,   0)
  const totalComplete = results.filter((r) => r.completed).length
  const elapsedMs     = Date.now() - startedAt

  return NextResponse.json({
    ok:       true,
    elapsedMs,
    processed:  results.length,
    totalSent,
    totalQueued,
    totalErrors,
    totalComplete,
    results,
  })
}
