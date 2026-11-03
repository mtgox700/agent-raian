/** Campaigns: launch, status, sender, send status, step statistics. */

import { z } from 'zod'
import { endpoint, Id } from '../define'
import { CampaignStatusChange, SendEstimate, SendStatus, StatusAction, StepStats, StepChannel } from '../schemas/campaign'

const params = z.object({ campaignId: Id })
const Sent = z.object({ queued: z.number().int(), attempted: z.number().int() })

export const campaignsEndpoints = [
  // app/api/campaigns/[campaignId]/contact-unverified/route.ts
  endpoint({
    id: 'campaigns.contactUnverified',
    method: 'POST',
    path: '/api/campaigns/[campaignId]/contact-unverified',
    summary: 'Opt-in: send step 1 to qualified leads whose email could not be verified (unknown status).',
    auth: 'session',
    params,
    response: z.object({ success: z.literal(true), stats: Sent }),
  }),

  // app/api/campaigns/[campaignId]/launch/route.ts
  endpoint({
    id: 'campaigns.launch',
    method: 'POST',
    path: '/api/campaigns/[campaignId]/launch',
    summary: 'Queue step 1 for every qualifying lead, mark the campaign ACTIVE and start the sending queue.',
    auth: 'session',
    params,
    body: z.object({ workspaceId: z.string().min(1) }),
    response: z.object({
      success: z.literal(true),
      data: z.object({
        queued: z.number().int(),
        totalSteps: z.number().int(),
        campaignStatus: z.literal('ACTIVE'),
        channel: StepChannel,
        estimate: SendEstimate.nullable(),
      }),
    }),
  }),

  // app/api/campaigns/[campaignId]/retry-pending/route.ts
  endpoint({
    id: 'campaigns.retryPending',
    method: 'POST',
    path: '/api/campaigns/[campaignId]/retry-pending',
    summary: 'Send now: start the sending queue right away for the campaign\'s queued messages.',
    auth: 'session',
    params,
    response: z.object({ success: z.literal(true), stats: z.object({ queued: z.number().int(), active: z.boolean() }) }),
  }),

  // app/api/campaigns/[campaignId]/send-status/route.ts
  endpoint({
    id: 'campaigns.sendStatus',
    method: 'GET',
    path: '/api/campaigns/[campaignId]/send-status',
    summary: 'Queued messages, the limit holding them (if any) and when sending resumes.',
    auth: 'session',
    params,
    response: SendStatus,
  }),

  // app/api/campaigns/[campaignId]/sender/route.ts
  endpoint({
    id: 'campaigns.getSender',
    method: 'GET',
    path: '/api/campaigns/[campaignId]/sender',
    summary: 'The campaign\'s "send from" mailbox and alias.',
    auth: 'session',
    params,
    response: z.object({ mailboxId: z.string().nullable(), fromAlias: z.string().nullable(), senderLost: z.boolean() }),
  }),

  // app/api/campaigns/[campaignId]/sender/route.ts
  endpoint({
    id: 'campaigns.updateSender',
    method: 'PATCH',
    path: '/api/campaigns/[campaignId]/sender',
    summary: 'Change the campaign\'s sender (null mailbox = workspace default); applies from the next email.',
    auth: 'session',
    params,
    body: z.object({
      mailboxId: z.string().min(1).max(64).nullable(),
      fromAlias: z.string().min(3).max(254).nullable(),
    }),
    response: z.object({ ok: z.literal(true), mailboxId: z.string().nullable(), fromAlias: z.string().nullable() }),
  }),

  // app/api/campaigns/[campaignId]/status/route.ts
  endpoint({
    id: 'campaigns.updateStatus',
    method: 'PATCH',
    path: '/api/campaigns/[campaignId]/status',
    summary: 'Pause, resume or complete a campaign.',
    auth: 'session',
    params,
    body: z.object({ action: StatusAction, workspaceId: z.string().min(1) }),
    response: z.object({ ok: z.literal(true), campaign: CampaignStatusChange }),
  }),

  // app/api/campaigns/[campaignId]/step-stats/route.ts
  endpoint({
    id: 'campaigns.stepStats',
    method: 'GET',
    path: '/api/campaigns/[campaignId]/step-stats',
    summary: 'Per-step analytics of a campaign (sent, delivered, opened, clicked, failed, rates).',
    auth: 'session',
    params,
    response: z.object({
      campaign: z.object({
        id: Id,
        name: z.string(),
        status: z.string(),
        goal: z.string(),
        sentCount: z.number(),
        openCount: z.number(),
        replyCount: z.number(),
        convertedCount: z.number(),
        targetIndustry: z.string().nullable(),
        createdAt: z.string(),
        completedAt: z.string().nullable(),
        lastProcessedAt: z.string().nullable(),
      }),
      stats: z.object({ campaignId: Id, steps: z.array(StepStats) }),
    }),
  }),
]
