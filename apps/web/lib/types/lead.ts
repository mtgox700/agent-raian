/**
 * Phantera: Lead Pipeline Types
 *
 * Zod schemas + TypeScript types for the full lead pipeline:
 * Apollo sourcing -> Hunter enrichment -> AI scoring -> Resend sending
 */

import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const COMPANY_SIZE_VALUES = ['XS', 'S', 'M', 'L', 'XL'] as const
export type CompanySize = typeof COMPANY_SIZE_VALUES[number]

export const LEAD_SCORE_BADGES = ['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP', 'UNSCORED'] as const
export type LeadScoreBadge = typeof LEAD_SCORE_BADGES[number]

export const EMAIL_SEND_STATUSES = ['PENDING', 'SENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED'] as const
export type EmailSendStatus = typeof EMAIL_SEND_STATUSES[number]

// ─── Apollo Search ────────────────────────────────────────────────────────────

// Seniority enum (Apollo official values)
const SENIORITY_VALUES = [
  'owner', 'founder', 'c_suite', 'partner', 'vp',
  'head', 'director', 'manager', 'senior', 'entry', 'intern',
] as const

const JOB_FUNCTION_VALUES = [
  'sales', 'marketing', 'engineering', 'product', 'operations', 'finance',
  'human_resources', 'design', 'legal', 'data', 'customer_success',
] as const

const EMAIL_STATUS_VALUES = [
  'verified', 'unverified', 'likely_to_engage', 'guessed',
] as const

const FUNDING_ROUND_VALUES = [
  'seed', 'series_a', 'series_b', 'series_c', 'series_d',
  'series_e', 'series_f', 'private_equity', 'venture_round',
  'angel', 'debt_financing', 'grant', 'convertible_note',
] as const

export const apolloSearchSchema = z.object({
  workspaceId: z.string().min(1),
  campaignId:  z.string().optional(),

  // ── Tier 1: basic (FREE) ──
  jobTitles:        z.array(z.string().min(1)).min(1, 'Au moins 1 titre requis'),
  industry:         z.string().optional(),
  companySizes:     z.array(z.enum(COMPANY_SIZE_VALUES)).optional(),
  country:          z.string().optional(),

  // ── Tier 2: advanced (PRO) ──
  seniorities:      z.array(z.enum(SENIORITY_VALUES)).optional(),
  jobFunctions:     z.array(z.enum(JOB_FUNCTION_VALUES)).optional(),
  multiCountries:   z.array(z.string().min(1)).optional(),
  emailStatus:      z.array(z.enum(EMAIL_STATUS_VALUES)).optional(),
  excludeDomains:   z.array(z.string().min(1)).optional(),
  companyKeywords:  z.array(z.string().min(1)).optional(),

  // ── Tier 3: expert (BUSINESS) ──
  organizationLocations: z.array(z.string().min(1)).optional(),
  excludeLocations:      z.array(z.string().min(1)).optional(),
  fundingRounds:         z.array(z.enum(FUNDING_ROUND_VALUES)).optional(),
  revenueMin:            z.number().int().min(0).optional(),
  revenueMax:            z.number().int().min(0).optional(),
  foundedYearMin:        z.number().int().min(1900).max(2100).optional(),
  foundedYearMax:        z.number().int().min(1900).max(2100).optional(),

  // ── Tier 4: max (ENTERPRISE) ──
  recentlyJoined:        z.boolean().optional(),
  recentFundingRounds:   z.array(z.enum(FUNDING_ROUND_VALUES)).optional(),
  recentNews:            z.boolean().optional(),
  usingTechAny:          z.array(z.string().min(1)).optional(),
  usingTechAll:          z.array(z.string().min(1)).optional(),
  notUsingTech:          z.array(z.string().min(1)).optional(),
  pastOrganizations:     z.array(z.string().min(1)).optional(),
  industryTagIds:        z.array(z.string().min(1)).optional(),

  // Legacy field kept for backward compat (string version of excludeDomains)
  excludedDomains: z.string().optional(),

  // Pagination
  limit: z.number().int().min(1).max(1000).default(25),
  page:  z.number().int().min(1).default(1),

})

export type ApolloSearchParams = z.infer<typeof apolloSearchSchema>

// ─── Lead Shape (UI) ──────────────────────────────────────────────────────────

export interface LeadWithEnrichment {
  id: string
  firstName: string
  lastName: string
  email: string
  company: string | null
  title: string | null
  industry: string | null
  linkedinUrl: string | null
  website: string | null
  country: string | null
  companySize: CompanySize | null
  source: string
  apolloId: string | null
  aiScore: number | null
  scoreBadge: LeadScoreBadge
  scoreReason: string | null
  status: string
  /** Opted out, bounced or set aside: never contacted again. */
  doNotContact?: boolean
  /** Professional phone, international digits only ("33612345678"). */
  phone?: string | null
  createdAt: string
  enrichment: {
    emailVerified: boolean
    emailConfidence: number | null
    emailStatus: string | null
    // Rich Apollo extras (stored in LeadEnrichment.linkedinData JSON)
    headline?: string | null
    city?: string | null
    companyDescription?: string | null
    companyLinkedinUrl?: string | null
    technologies?: string[]
  } | null
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

export const batchEnrichSchema = z.object({
  workspaceId: z.string().min(1),
  leadIds: z.array(z.string().min(1)).min(1).max(25, 'Max 25 leads par batch'),
})

export type BatchEnrichParams = z.infer<typeof batchEnrichSchema>

export interface EnrichResult {
  leadId: string
  emailVerified: boolean
  emailConfidence: number
  emailStatus: string
  error?: string
}

// ─── AI Scoring ───────────────────────────────────────────────────────────────

export const batchScoreSchema = z.object({
  workspaceId: z.string().min(1),
  leadIds: z.array(z.string().min(1)).min(1).max(100),
  campaignId: z.string().optional(),
})

export type BatchScoreParams = z.infer<typeof batchScoreSchema>

export interface ScoreResult {
  leadId: string
  /** Null when the lead could not be scored: badge UNSCORED, never sent automatically. */
  score: number | null
  badge: LeadScoreBadge
  reason: string
  dimensions: null | {
    titleMatch: number
    industryMatch: number
    companySizeMatch: number
    emailQuality: number
    intentSignals: number
  }
}

// ─── Campaign Launch ──────────────────────────────────────────────────────────

export const launchCampaignSchema = z.object({
  workspaceId: z.string().min(1),
})

export type LaunchCampaignParams = z.infer<typeof launchCampaignSchema>

export interface LaunchResult {
  sent: number
  failed: number
  skipped: number
  campaignStatus: string
}

// ─── Pipeline Progress (SSE events: 5 agents) ───────────────────────────────
//
//  Agent 1: Sourcing      (Apollo)
//  Agent 2: Enrichissement (Hunter)
//  Agent 3: Scoring IA    (OpenAI)
//  Agent 4: Copywriter IA (generates personalised sequences for top leads)
//  Agent 5: Outreach Prep (queues fast-track leads ready for send)

export type PipelineEvent =
  // Agent 1: Sourcing
  | { type: 'search_start'; total: number }
  | { type: 'search_progress'; found: number }
  | { type: 'search_done'; saved: number; duplicates: number }
  // Agent 2: Enrichissement
  | { type: 'enrich_start'; total: number }
  | { type: 'enrich_progress'; enriched: number; total: number }
  | { type: 'enrich_done'; verified: number; total: number }
  // Agent 3: Scoring IA
  | { type: 'score_start'; total: number }
  | { type: 'score_progress'; scored: number; total: number }
  | { type: 'score_done'; distribution: Record<LeadScoreBadge, number> }
  // Terminal events
  | { type: 'pipeline_done'; leads: LeadWithEnrichment[]; summary: PipelineSummary }
  | { type: 'error'; message: string }

export interface PipelineSummary {
  totalFound: number
  totalSaved: number
  totalEnriched: number
  distribution: Record<LeadScoreBadge, number>
}
