/**
 * Phantera: Lead Search Filter Tiers
 *
 * Maps each plan to the set of search filters it can use.
 * Single source of truth for filter gating across:
 *   - Apollo service (server-side validation)
 *   - LeadSearchDrawer UI (which filters to render)
 *   - Upgrade modal (which features to highlight)
 *
 * Tier ladder:
 *   - basic    (FREE / STARTER): 4 filters
 *   - advanced (PRO): 10 filters  (+ seniority, multi-location, exclude...)
 *   - expert   (BUSINESS): 17 filters  (+ funding, revenue, year, taxonomy)
 *   - max      (ENTERPRISE): 25 filters  (+ intent signals + tech stack)
 */

import type { Plan } from '@prisma/client'

// ─── Filter keys: single source of truth for what filters exist ──────────────

export const FILTER_KEYS = [
  // ── Tier 1: basic (FREE) ──
  'jobTitles',          // person_titles[]
  'industry',           // q_keywords (free text)
  'companySizes',       // organization_num_employees_ranges[]
  'country',            // person_locations[] (single value)

  // ── Tier 2: advanced (PRO) ──
  'seniorities',                // person_seniorities[]
  'jobFunctions',               // current_job_function[]
  'multiCountries',             // person_locations[] (multiple)
  'emailStatus',                // person_email_status[]
  'excludeDomains',             // q_not_organization_domains_list[]
  'companyKeywords',            // q_organization_keyword_tags[]

  // ── Tier 3: expert (BUSINESS) ──
  'organizationLocations',      // organization_locations[]
  'excludeLocations',           // person_not_locations[]
  'fundingRounds',              // organization_funding_rounds[]
  'revenueMin',                 // revenue_range[min]
  'revenueMax',                 // revenue_range[max]
  'foundedYearMin',             // organization_founded_year_range[min]
  'foundedYearMax',             // organization_founded_year_range[max]

  // ── Tier 4: max (ENTERPRISE) ──
  'recentlyJoined',             // recently_joined_company (boolean)
  'recentFundingRounds',        // recent_funding_rounds[]
  'recentNews',                 // recent_news (boolean)
  'usingTechAny',               // currently_using_any_of_technology_uids[]
  'usingTechAll',               // currently_using_all_of_technology_uids[]
  'notUsingTech',               // currently_not_using_any_of_technology_uids[]
  'pastOrganizations',          // person_past_organizations_ids[]
  'industryTagIds',             // organization_industry_tag_ids[]
] as const

export type FilterKey = typeof FILTER_KEYS[number]

// ─── Tier definitions ────────────────────────────────────────────────────────

export type FilterTier = 'basic' | 'advanced' | 'expert' | 'max'

const BASIC_FILTERS: FilterKey[] = [
  'jobTitles', 'industry', 'companySizes', 'country',
]

const ADVANCED_FILTERS: FilterKey[] = [
  ...BASIC_FILTERS,
  'seniorities', 'jobFunctions', 'multiCountries', 'emailStatus',
  'excludeDomains', 'companyKeywords',
]

const EXPERT_FILTERS: FilterKey[] = [
  ...ADVANCED_FILTERS,
  'organizationLocations', 'excludeLocations', 'fundingRounds',
  'revenueMin', 'revenueMax', 'foundedYearMin', 'foundedYearMax',
]

const MAX_FILTERS: FilterKey[] = [
  ...EXPERT_FILTERS,
  'recentlyJoined', 'recentFundingRounds', 'recentNews',
  'usingTechAny', 'usingTechAll', 'notUsingTech',
  'pastOrganizations', 'industryTagIds',
]

const TIER_FILTERS: Record<FilterTier, FilterKey[]> = {
  basic:    BASIC_FILTERS,
  advanced: ADVANCED_FILTERS,
  expert:   EXPERT_FILTERS,
  max:      MAX_FILTERS,
}

// ─── Plan -> tier mapping ─────────────────────────────────────────────────────

const PLAN_TO_TIER: Record<Plan, FilterTier> = {
  FREE:       'basic',
  STARTER:    'basic',
  PRO:        'advanced',
  BUSINESS:   'expert',
  ENTERPRISE: 'max',
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getFilterTier(plan: Plan): FilterTier {
  return PLAN_TO_TIER[plan]
}

export function getAllowedFilters(plan: Plan): FilterKey[] {
  return TIER_FILTERS[PLAN_TO_TIER[plan]]
}

export function isFilterAllowed(plan: Plan, key: FilterKey): boolean {
  return TIER_FILTERS[PLAN_TO_TIER[plan]].includes(key)
}

/**
 * Returns the minimum plan that unlocks a given filter.
 * Used to show "Upgrade to PRO" hints next to locked filters.
 */
export function getMinPlanForFilter(key: FilterKey): Plan {
  if (BASIC_FILTERS.includes(key))    return 'FREE'
  if (ADVANCED_FILTERS.includes(key)) return 'PRO'
  if (EXPERT_FILTERS.includes(key))   return 'BUSINESS'
  return 'ENTERPRISE'
}

// ─── Enum values used in the UI ──────────────────────────────────────────────

export const SENIORITY_OPTIONS = [
  { value: 'owner',     label: 'Propriétaire' },
  { value: 'founder',   label: 'Fondateur' },
  { value: 'c_suite',   label: 'Direction générale (CEO, CTO, CFO)' },
  { value: 'partner',   label: 'Associé' },
  { value: 'vp',        label: 'Vice-président' },
  { value: 'head',      label: 'Responsable de pôle' },
  { value: 'director',  label: 'Directeur' },
  { value: 'manager',   label: 'Manager' },
  { value: 'senior',    label: 'Senior' },
  { value: 'entry',     label: 'Débutant' },
  { value: 'intern',    label: 'Stagiaire' },
] as const

export const JOB_FUNCTION_OPTIONS = [
  { value: 'sales',           label: 'Commercial' },
  { value: 'marketing',       label: 'Marketing' },
  { value: 'engineering',     label: 'Ingénierie' },
  { value: 'product',         label: 'Produit' },
  { value: 'operations',      label: 'Opérations' },
  { value: 'finance',         label: 'Finance' },
  { value: 'human_resources', label: 'Ressources humaines' },
  { value: 'design',          label: 'Design' },
  { value: 'legal',           label: 'Juridique' },
  { value: 'data',            label: 'Données et analyse' },
  { value: 'customer_success', label: 'Succès client' },
] as const

export const EMAIL_STATUS_OPTIONS = [
  { value: 'verified',          label: 'Vérifié' },
  { value: 'likely_to_engage',  label: 'Réponse probable' },
  { value: 'unverified',        label: 'Non vérifié' },
  { value: 'guessed',           label: 'Deviné' },
] as const

export const FUNDING_ROUND_OPTIONS = [
  { value: 'seed',            label: 'Seed' },
  { value: 'series_a',        label: 'Series A' },
  { value: 'series_b',        label: 'Series B' },
  { value: 'series_c',        label: 'Series C' },
  { value: 'series_d',        label: 'Series D+' },
  { value: 'private_equity',  label: 'Capital-investissement' },
  { value: 'venture_round',   label: 'Capital-risque' },
  { value: 'angel',           label: 'Business angels' },
  { value: 'debt_financing',  label: 'Dette' },
  { value: 'grant',           label: 'Subvention' },
] as const
