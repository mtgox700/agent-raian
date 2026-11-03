/**
 * GET /api/cron/daily-digest
 *
 * Runs every day at 08:00 UTC via Vercel Cron.
 * For each campaign with email activity in the last 24 h, creates a
 * CAMPAIGN_COMPLETED digest notification: idempotent (skips if a digest
 * notification for today already exists for that campaign).
 *
 * Secured with CRON_SECRET (set in Vercel environment variables).
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createNotification } from '@/lib/services/notifications.service'
import { safeCompare } from '@/lib/security/crypto'
import { runHousekeeping } from '@/lib/inngest/housekeeping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authorization = req.headers.get('authorization')
  const cronSecret    = process.env.CRON_SECRET

  if (!safeCompare(authorization, cronSecret ? `Bearer ${cronSecret}` : null)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since   = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const todayKey = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"

  // Find campaigns that had sends in the last 24 h
  const activeCampaigns = await db.campaign.findMany({
    where: {
      emailSends: { some: { sentAt: { gte: since } } },
    },
    select: {
      id:          true,
      workspaceId: true,
      name:        true,
      sentCount:   true,
      openCount:   true,
      replyCount:  true,
    },
  })

  let created = 0
  let skipped = 0

  for (const campaign of activeCampaigns) {
    // Idempotency: skip if a digest for this campaign was already created today
    const existing = await db.notification.findFirst({
      where: {
        workspaceId: campaign.workspaceId,
        campaignId:  campaign.id,
        type:        'CAMPAIGN_COMPLETED',
        createdAt:   { gte: new Date(todayKey) },
      },
      select: { id: true },
    })

    if (existing) {
      skipped++
      continue
    }

    const openRate  = campaign.sentCount > 0
      ? Math.round((campaign.openCount  / campaign.sentCount) * 100) : 0
    const replyRate = campaign.sentCount > 0
      ? Math.round((campaign.replyCount / campaign.sentCount) * 100) : 0

    await createNotification({
      workspaceId: campaign.workspaceId,
      type:        'CAMPAIGN_COMPLETED',
      title:       'Récapitulatif du jour',
      body:        `${campaign.name} : ${campaign.sentCount} emails · ${openRate}% ouverture · ${replyRate}% réponse`,
      campaignId:  campaign.id,
      data: {
        sentCount:  campaign.sentCount,
        openCount:  campaign.openCount,
        replyCount: campaign.replyCount,
        openRate,
        replyRate,
        digestDate: todayKey,
      },
    })

    created++
  }

  // Retention purges run daily on Inngest (lib/inngest/housekeeping): this
  // Vercel cron is not deployed. Running them here too is harmless (idempotent).
  const housekeeping = await runHousekeeping()

  return NextResponse.json({ ok: true, created, skipped, housekeeping })
}
