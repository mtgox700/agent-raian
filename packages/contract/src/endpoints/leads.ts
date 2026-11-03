/** Leads: list, search, status, enrichment, scoring, touches on a lead. */

import { z } from 'zod'
import { endpoint, Id, IsoDate, Ok } from '../define'
import { LeadRow, LeadStatus } from '../schemas/lead'
import { AvailableLead, EmailEnrichResult, HotLead, PipelineEvent, ScoreDistribution } from '../schemas/leadPipeline'
import { SentTouch, TouchChannel } from '../schemas/touch'

const WorkspaceLeadIds = (max: number) => z.object({
  workspaceId: z.string().min(1),
  leadIds: z.array(z.string().min(1)).min(1).max(max),
})

const FundingRounds = z.array(z.enum([
  'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'series_e', 'series_f',
  'private_equity', 'venture_round', 'angel', 'debt_financing', 'grant', 'convertible_note',
]))

export const leadsEndpoints = [
  // app/api/leads/route.ts
  endpoint({
    id: 'leads.list',
    method: 'GET',
    path: '/api/leads',
    summary: 'Leads of a workspace (best 500), searchable across the whole base.',
    auth: 'session',
    query: z.object({
      workspaceId: Id,
      q: z.string().max(100).optional(),
      status: z.string().optional(),
    }),
    response: z.object({ success: z.literal(true), data: z.array(LeadRow), total: z.number().int() }),
  }),

  // app/api/leads/[leadId]/status/route.ts
  endpoint({
    id: 'leads.updateStatus',
    method: 'PATCH',
    path: '/api/leads/[leadId]/status',
    summary: 'Update the status and/or the do-not-contact flag of a lead.',
    auth: 'session',
    params: z.object({ leadId: Id }),
    body: z.object({
      status: LeadStatus.optional(),
      doNotContact: z.boolean().optional(),
    }).refine((b) => b.status !== undefined || b.doNotContact !== undefined, { message: 'Aucune modification' }),
    response: z.object({ ok: z.literal(true), lead: z.object({ id: Id, status: z.string(), doNotContact: z.boolean() }) }),
  }),

  // app/api/leads/[leadId]/linkedin-message/route.ts
  endpoint({
    id: 'leads.sendLinkedinMessage',
    method: 'POST',
    path: '/api/leads/[leadId]/linkedin-message',
    summary: 'Send a one-off LinkedIn DM (falls back to a connection invitation carrying the message).',
    auth: 'session',
    params: z.object({ leadId: Id }),
    body: z.object({ message: z.string().trim().min(1, 'Message vide').max(1500, 'Message trop long (1500 caractères max)') }),
    response: z.object({ ok: z.literal(true), via: z.enum(['dm', 'invitation']) }),
  }),

  // app/api/leads/[leadId]/phone/reveal/route.ts
  endpoint({
    id: 'leads.phoneRevealState',
    method: 'GET',
    path: '/api/leads/[leadId]/phone/reveal',
    summary: 'Phone lookup state of a lead for the lead panel.',
    auth: 'session',
    params: z.object({ leadId: Id }),
    response: z.object({
      status: z.string().nullable(),
      phone: z.string().nullable(),
      phoneSource: z.string().nullable(),
      fromApollo: z.boolean(),
      remainingMonth: z.number().int(),
    }),
  }),

  // app/api/leads/[leadId]/phone/reveal/route.ts
  endpoint({
    id: 'leads.phoneReveal',
    method: 'POST',
    path: '/api/leads/[leadId]/phone/reveal',
    summary: 'Start the Apollo phone lookup (paid, monthly quota).',
    auth: 'session',
    params: z.object({ leadId: Id }),
    response: z.object({ ok: z.literal(true), status: z.literal('PENDING'), remainingMonth: z.number().int() }),
  }),

  // app/api/leads/[leadId]/phone/route.ts
  endpoint({
    id: 'leads.setPhone',
    method: 'PATCH',
    path: '/api/leads/[leadId]/phone',
    summary: 'Set or clear the lead phone (international form; empty string clears it).',
    auth: 'session',
    params: z.object({ leadId: Id }),
    body: z.object({ phone: z.string().max(30) }),
    response: z.object({ ok: z.literal(true), phone: z.string().nullable() }),
  }),

  // app/api/leads/[leadId]/touch/draft/route.ts
  endpoint({
    id: 'leads.draftTouch',
    method: 'POST',
    path: '/api/leads/[leadId]/touch/draft',
    summary: 'Draft the WhatsApp or SMS message the user will send from their phone.',
    auth: 'session',
    params: z.object({ leadId: Id }),
    body: z.object({ channel: TouchChannel }),
    response: z.object({ ok: z.literal(true), body: z.string(), remainingToday: z.number().int() }),
  }),

  // app/api/leads/[leadId]/touch/route.ts
  endpoint({
    id: 'leads.listTouches',
    method: 'GET',
    path: '/api/leads/[leadId]/touch',
    summary: 'The last 10 WhatsApp/SMS messages sent to the lead.',
    auth: 'session',
    params: z.object({ leadId: Id }),
    response: z.object({ ok: z.literal(true), touches: z.array(SentTouch) }),
  }),

  // app/api/leads/[leadId]/touch/route.ts
  endpoint({
    id: 'leads.recordTouch',
    method: 'POST',
    path: '/api/leads/[leadId]/touch',
    summary: 'Record a WhatsApp/SMS message the user just sent from their phone.',
    auth: 'session',
    params: z.object({ leadId: Id }),
    body: z.object({ channel: TouchChannel, body: z.string().max(2000) }),
    response: z.object({ ok: z.literal(true), remainingToday: z.number().int() }),
  }),

  // app/api/leads/assign-campaign/route.ts
  endpoint({
    id: 'leads.assignCampaign',
    method: 'POST',
    path: '/api/leads/assign-campaign',
    summary: 'Assign leads to a campaign (campaignId null unassigns).',
    auth: 'session',
    body: z.object({
      workspaceId: z.string().min(1),
      leadIds: z.array(z.string().min(1)).min(1).max(500),
      campaignId: z.string().min(1).nullable(),
    }),
    response: z.object({
      success: z.literal(true),
      data: z.object({
        assigned: z.number().int(),
        campaignId: z.string().nullable(),
        queued: z.number().int(),
        campaignStatus: z.string().nullable(),
      }),
    }),
  }),

  // app/api/leads/available/route.ts
  endpoint({
    id: 'leads.available',
    method: 'GET',
    path: '/api/leads/available',
    summary: 'Leads free to start a campaign (no campaign, contactable, FAST_TRACK or NORMAL), best 500.',
    auth: 'session',
    query: z.object({ q: z.string().optional() }),
    response: z.object({ success: z.literal(true), data: z.object({ leads: z.array(AvailableLead), total: z.number().int() }) }),
  }),

  // app/api/leads/enrich/[leadId]/route.ts
  endpoint({
    id: 'leads.enrichOne',
    method: 'POST',
    path: '/api/leads/enrich/[leadId]',
    summary: 'Verify the email of one lead (Hunter) and store the enrichment.',
    auth: 'session',
    params: z.object({ leadId: Id }),
    response: z.object({ success: z.literal(true), data: EmailEnrichResult }),
  }),

  // app/api/leads/enrich/route.ts
  endpoint({
    id: 'leads.enrichBatch',
    method: 'POST',
    path: '/api/leads/enrich',
    summary: 'Verify the emails of up to 25 leads (Hunter); leads verified in the last 30 days are skipped.',
    auth: 'session',
    body: WorkspaceLeadIds(25),
    response: z.object({
      success: z.literal(true),
      data: z.object({ results: z.array(EmailEnrichResult), enriched: z.number().int(), failed: z.number().int() }),
    }),
  }),

  // app/api/leads/export-log/route.ts
  endpoint({
    id: 'leads.logExport',
    method: 'POST',
    path: '/api/leads/export-log',
    summary: 'Record a browser-side CSV export of leads in the audit log.',
    auth: 'session',
    body: z.object({ kind: z.enum(['leads', 'hot_leads']), count: z.number().int().min(0).max(1_000_000) }),
    response: Ok,
  }),

  // app/api/leads/hot/route.ts
  endpoint({
    id: 'leads.hot',
    method: 'GET',
    path: '/api/leads/hot',
    summary: 'Hot leads (qualified / positive reply), cursor-paginated (limit capped at 50).',
    auth: 'session',
    query: z.object({ limit: z.coerce.number().int().optional(), cursor: z.string().optional() }),
    response: z.object({ leads: z.array(HotLead), nextCursor: z.string().nullable() }),
  }),

  // app/api/leads/manual/route.ts
  endpoint({
    id: 'leads.createManual',
    method: 'POST',
    path: '/api/leads/manual',
    summary: 'Create (or update, by email) a single lead by hand.',
    auth: 'session',
    body: z.object({
      workspaceId: z.string().min(1),
      firstName: z.string().min(1).max(100).trim(),
      lastName: z.string().min(1).max(100).trim(),
      email: z.string().email('Email invalide').trim().toLowerCase(),
      company: z.string().max(200).trim().optional(),
      title: z.string().max(200).trim().optional(),
      industry: z.string().max(200).trim().optional(),
      linkedinUrl: z.string().trim().max(300)
        .refine((v) => /linkedin\.com\/in\/[^/?#]+/i.test(v), 'URL LinkedIn invalide (attendu: linkedin.com/in/…)')
        .optional().or(z.literal('')),
      website: z.string().trim().max(300).optional().or(z.literal('')),
      campaignId: z.string().optional(),
      scoreBadge: z.enum(['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP']).default('FAST_TRACK'),
    }),
    response: z.object({
      success: z.literal(true),
      // Spread of the whole Prisma Lead row: known fields typed, the rest passes through.
      // TODO(contract): enumerate every remaining Prisma Lead column (apps/web/prisma/schema.prisma).
      data: z.object({
        id: Id,
        workspaceId: z.string(),
        campaignId: z.string().nullable(),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        company: z.string().nullable(),
        title: z.string().nullable(),
        industry: z.string().nullable(),
        linkedinUrl: z.string().nullable(),
        website: z.string().nullable(),
        source: z.string(),
        aiScore: z.number().nullable(),
        scoreBadge: z.string(),
        scoreReason: z.string().nullable(),
        status: z.string(),
        createdAt: IsoDate,
        updatedAt: IsoDate,
        enrichment: z.object({
          emailVerified: z.boolean(),
          emailConfidence: z.number().nullable(),
          emailStatus: z.string().nullable(),
        }).nullable(),
      }).passthrough(),
    }),
  }),

  // app/api/leads/score/route.ts
  endpoint({
    id: 'leads.score',
    method: 'POST',
    path: '/api/leads/score',
    summary: 'AI-score up to 100 leads against their campaign targeting (forced rescoring).',
    auth: 'session',
    body: WorkspaceLeadIds(100).extend({ campaignId: z.string().optional() }),
    response: z.object({ success: z.literal(true), data: z.object({ scored: z.number().int(), distribution: ScoreDistribution }) }),
  }),

  // app/api/leads/search/stream/route.ts
  endpoint({
    id: 'leads.searchStream',
    method: 'POST',
    path: '/api/leads/search/stream',
    summary: 'Full sourcing pipeline (Apollo, Hunter, AI scoring) streamed as SSE; each event is `data: <json>`.',
    auth: 'session',
    // Mirror of apolloSearchSchema (apps/web/lib/types/lead.ts).
    body: z.object({
      workspaceId: z.string().min(1),
      campaignId: z.string().optional(),
      jobTitles: z.array(z.string().min(1)).min(1, 'Au moins 1 titre requis'),
      industry: z.string().optional(),
      companySizes: z.array(z.enum(['XS', 'S', 'M', 'L', 'XL'])).optional(),
      country: z.string().optional(),
      seniorities: z.array(z.enum(['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director', 'manager', 'senior', 'entry', 'intern'])).optional(),
      jobFunctions: z.array(z.enum(['sales', 'marketing', 'engineering', 'product', 'operations', 'finance', 'human_resources', 'design', 'legal', 'data', 'customer_success'])).optional(),
      multiCountries: z.array(z.string().min(1)).optional(),
      emailStatus: z.array(z.enum(['verified', 'unverified', 'likely_to_engage', 'guessed'])).optional(),
      excludeDomains: z.array(z.string().min(1)).optional(),
      companyKeywords: z.array(z.string().min(1)).optional(),
      organizationLocations: z.array(z.string().min(1)).optional(),
      excludeLocations: z.array(z.string().min(1)).optional(),
      fundingRounds: FundingRounds.optional(),
      revenueMin: z.number().int().min(0).optional(),
      revenueMax: z.number().int().min(0).optional(),
      foundedYearMin: z.number().int().min(1900).max(2100).optional(),
      foundedYearMax: z.number().int().min(1900).max(2100).optional(),
      recentlyJoined: z.boolean().optional(),
      recentFundingRounds: FundingRounds.optional(),
      recentNews: z.boolean().optional(),
      usingTechAny: z.array(z.string().min(1)).optional(),
      usingTechAll: z.array(z.string().min(1)).optional(),
      notUsingTech: z.array(z.string().min(1)).optional(),
      pastOrganizations: z.array(z.string().min(1)).optional(),
      industryTagIds: z.array(z.string().min(1)).optional(),
      excludedDomains: z.string().optional(),
      limit: z.number().int().min(1).max(1000).default(25),
      page: z.number().int().min(1).default(1),
    }),
    response: PipelineEvent,
    responseKind: 'stream',
  }),
]
