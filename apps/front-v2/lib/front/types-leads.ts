/**
 * Shapes of the Leads screen (/dashboard/leads), derived from the contract
 * (never re-declared by hand).
 */
import type { z } from 'zod'
import type { CallInput, CallOutput } from '@phantera/sdk'
import type { PipelineEvent as PipelineEventSchema } from '@phantera/contract'

export type LeadsView = CallOutput<'views.leads'>
export type LeadRow = LeadsView['leads'][number]
export type LeadScoreBadge = LeadRow['scoreBadge']
export type CompanySize = NonNullable<LeadRow['companySize']>
export type CampaignOption = LeadsView['campaigns'][number]
export type WorkspacePlan = LeadsView['plan']
export type AnnualPlan = LeadsView['annualPlans'][number]

/** Body of the sourcing pipeline (Apollo search, e-mail check, scoring). */
export type LeadSearchParams = CallInput<'leads.searchStream'>['body']
export type PipelineEvent = z.infer<typeof PipelineEventSchema>
export type PipelineSummary = Extract<PipelineEvent, { type: 'pipeline_done' }>['summary']

export type SentTouch = CallOutput<'leads.listTouches'>['touches'][number]
export type PhoneRevealState = CallOutput<'leads.phoneRevealState'>
