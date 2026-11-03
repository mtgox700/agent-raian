/** Campaigns: launch, status, sender, send status, step statistics. */

import { z } from 'zod'
import { endpoint, Id } from '../define'
import { CampaignStatusChange, SendEstimate, SendStatus, StatusAction, StepStats, StepChannel } from '../schemas/campaign'

const params = z.object({ campaignId: Id })

const WizardChannel = z.enum(['email', 'linkedin', 'whatsapp', 'sms'])

/**
 * The campaign wizard as the front holds it (lib/types/campaign-wizard): the
 * back maps it to a campaign and validates the result (quota, sequence rules,
 * lead source, invite-note length), answering 422 with the first issue.
 * Unknown keys (AI suggestions, product profile…) are accepted and ignored.
 */
const CampaignWizardInput = z.object({
  step1: z.object({
    name: z.string(),
    goal: z.enum(['leads', 'demos', 'sales', 'awareness']),
    industry: z.string(),
  }),
  step2: z.object({
    targetTitles: z.array(z.string()),
    targetCompanySizes: z.array(z.enum(['XS', 'S', 'M', 'L', 'XL'])),
    targetGeos: z.array(z.string()),
    excludedDomains: z.string(),
  }),
  step3: z.object({
    tone: z.enum(['professional', 'casual', 'bold', 'consultative']),
    valueProposition: z.string(),
    emailSteps: z.array(z.object({
      dayOffset: z.number(),
      channel: WizardChannel.optional(),
      subject: z.string(),
      body: z.string(),
      inviteNote: z.string().optional(),
      isAiGenerated: z.boolean(),
    })),
  }),
  step4: z.object({
    leadSource: z.enum(['ai', 'csv', 'manual']),
    estimatedLeads: z.number(),
    leadIds: z.array(z.string()).optional(),
    mailboxId: z.string().nullable().optional(),
    fromAlias: z.string().nullable().optional(),
  }),
})
const Sent = z.object({ queued: z.number().int(), attempted: z.number().int() })

export const campaignsEndpoints = [
  // app/api/campaigns/route.ts
  endpoint({
    id: 'campaigns.create',
    method: 'POST',
    path: '/api/campaigns',
    summary: 'Create a campaign from the wizard: AI prospecting is queued in the background; on existing leads, step 1 is queued at once.',
    auth: 'session',
    body: CampaignWizardInput,
    response: z.object({ success: z.literal(true), campaignId: Id, workspaceId: Id }),
  }),

  // app/api/campaigns/steps/[stepId]/route.ts
  endpoint({
    id: 'campaigns.updateStep',
    method: 'PATCH',
    path: '/api/campaigns/steps/[stepId]',
    summary: 'Edit a sequence step (subject, body, delay, LinkedIn invite note) while some lead has not received it; step 1 keeps J+0.',
    auth: 'session',
    params: z.object({ stepId: Id }),
    body: z.object({
      subject: z.string().min(1, 'Sujet requis').max(200).optional(),
      body: z.string().min(1, 'Corps requis').optional(),
      dayOffset: z.number().int().min(0).max(60).optional(),
      // The rendered-length limit of LinkedIn (300) is checked by the back.
      inviteNote: z.string().optional(),
    }),
    response: z.object({ success: z.literal(true) }),
  }),

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
