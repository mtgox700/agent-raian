/**
 * Phantera: Inngest durable functions for sequence sending.
 *
 *  sequenceScheduler: hourly cron. Finds ACTIVE campaigns and fans out one
 *                        event per campaign (so each is processed in its own
 *                        durable run with independent retries).
 *  campaignProcessor: processes a single campaign's due steps. Concurrency-
 *                        capped to respect ESP rate limits; retried on failure.
 *                        Idempotency is enforced inside sendStepToLead + the
 *                        atomic lastProcessedAt claim, so a retry never
 *                        double-sends.
 *
 * Handlers are exported separately from the wired functions so they can be
 * unit-tested with a fake `step`.
 */

import { inngest, CAMPAIGN_PROCESS_EVENT } from './client'
import { db } from '@/lib/db'
import { processCampaign } from '@/lib/sequences/process-campaign'
import type { CampaignProcessResult } from '@/lib/sequences/types'

// ── Minimal step surface we use (keeps handlers testable) ────────────────────

export interface StepLike {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>
  sendEvent(id: string, events: Array<{ name: string; data: unknown }>): Promise<unknown>
}

// ── Handlers (pure-ish, testable) ────────────────────────────────────────────

export async function schedulerHandler({ step }: { step: StepLike }): Promise<{ fannedOut: number }> {
  const campaigns = await step.run('load-active-campaigns', async () =>
    db.campaign.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
  )

  if (campaigns.length === 0) return { fannedOut: 0 }

  await step.sendEvent(
    'fan-out-campaigns',
    campaigns.map((c) => ({ name: CAMPAIGN_PROCESS_EVENT, data: { campaignId: c.id } })),
  )

  return { fannedOut: campaigns.length }
}

export async function processorHandler(
  { event, step }: { event: { data: { campaignId: string } }; step: StepLike },
): Promise<CampaignProcessResult> {
  const { campaignId } = event.data
  return step.run('process-campaign', async () => processCampaign(db, campaignId))
}

// ── Wired durable functions ──────────────────────────────────────────────────

export const sequenceScheduler = inngest.createFunction(
  {
    id: 'sequence-scheduler',
    name: 'Sequence scheduler (hourly fan-out)',
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => schedulerHandler({ step: step as unknown as StepLike }),
)

export const campaignProcessor = inngest.createFunction(
  {
    id: 'campaign-processor',
    name: 'Process campaign due steps',
    concurrency: { limit: 5 }, // cap concurrent campaign sends (ESP rate limits)
    retries: 3,                // transient retries; idempotency prevents double-sends
    triggers: [{ event: CAMPAIGN_PROCESS_EVENT }],
  },
  async ({ event, step }) =>
    processorHandler({
      event: event as unknown as { data: { campaignId: string } },
      step: step as unknown as StepLike,
    }),
)

export const inngestFunctions = [sequenceScheduler, campaignProcessor]
