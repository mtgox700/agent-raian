/**
 * Phantera: Apollo.io API Client
 *
 * Lead sourcing via Apollo People API Search endpoint.
 *
 * Endpoint : POST /api/v1/mixed_people/api_search
 * - Does NOT consume credits
 * - Does NOT return emails or phone numbers (use enrichment for that)
 * - Returns up to 50 000 records (100/page, 500 pages max)
 * - Requires a master API key (x-api-key header)
 * - Parameters sent as URL query params (not JSON body)
 *
 * Size mapping: XS=1-10, S=11-50, M=51-200, L=201-1000, XL=1001+
 */

import type { ApolloSearchParams, CompanySize } from '@/lib/types/lead'

// ─── Company size -> Apollo employee ranges ────────────────────────────────────

const SIZE_TO_APOLLO_RANGE: Record<CompanySize, string> = {
  XS: '1,10',
  S:  '11,50',
  M:  '51,200',
  L:  '201,1000',
  XL: '1001,10000',
}

// ─── Apollo API response shapes ───────────────────────────────────────────────

interface ApolloPersonRaw {
  id: string
  first_name: string
  last_name_obfuscated: string   // e.g. "Do***e": obfuscated for privacy
  title: string | null
  last_refreshed_at: string
  has_email: boolean             // true = Apollo has an email, use enrichment to get it
  has_city: boolean
  has_state: boolean
  has_country: boolean
  has_direct_phone: string       // "Yes" | "Maybe: ..."
  organization?: {
    name: string
    // Company domain: usually present in the FREE search response (no credits
    // needed). Captured so the enrichment waterfall can resolve emails by domain
    // even when Apollo has 0 enrichment credits.
    primary_domain?: string | null
    website_url?:    string | null
    has_industry: boolean
    has_phone: boolean
    has_city: boolean
    has_state: boolean
    has_country: boolean
    has_zip_code: boolean
    has_revenue: boolean
    has_employee_count: boolean
  }
}

interface ApolloApiSearchResponse {
  total_entries: number
  people: ApolloPersonRaw[]
}

// ─── Public result types ──────────────────────────────────────────────────────

export interface ApolloLeadResult {
  apolloId:    string
  firstName:   string
  lastName:    string        // obfuscated from search; enrichment fills real value
  email:       string | null // null from search; enrichment fills it
  title:       string | null
  company:     string | null
  industry:    string | null // not returned by search; enrichment fills it
  linkedinUrl: string | null // not returned by search; enrichment fills it
  country:     string | null // not returned as string by search
  website:     string | null // not returned by search; enrichment fills it
  hasEmail:    boolean       // hint: whether Apollo can enrich an email
}

export interface ApolloSearchResult {
  leads:      ApolloLeadResult[]
  pagination: { total: number; page: number; perPage: number }
}

// ─── Enrichment result (from bulk_match) ─────────────────────────────────────

export interface ApolloEnrichResult {
  apolloId:    string
  email:       string | null   // real work email (null if not found / no credits)
  firstName:   string
  lastName:    string          // real last name (not obfuscated)
  title:       string | null
  company:     string | null
  industry:    string | null
  linkedinUrl: string | null
  country:     string | null
  // ── Rich enrichment extras (free: already in the bulk_match payload) ──
  headline:           string | null  // the person's real LinkedIn headline
  city:               string | null  // person city (finer than country)
  companyWebsite:     string | null  // organization website URL
  companyDescription: string | null  // short company description (1 sentence)
  companyLinkedinUrl: string | null  // organization LinkedIn page
  technologies:       string[]       // tech stack the company uses (intent signal)
}

// ─── Apollo bulk_match response shapes ───────────────────────────────────────

interface ApolloBulkPersonRaw {
  id:           string
  first_name:   string
  last_name:    string
  email:        string | null
  title:        string | null
  linkedin_url: string | null
  country:      string | null
  headline:     string | null
  city:         string | null
  organization?: {
    name:              string | null
    industry:          string | null
    website_url?:      string | null
    linkedin_url?:     string | null
    short_description?: string | null
    technology_names?: string[] | null
  }
}

interface ApolloBulkMatchResponse {
  matches:           ApolloBulkPersonRaw[]
  credits_used:      number
  credits_remaining: number
}

// ─── Mock data (used in dev when APOLLO_API_KEY is not set) ───────────────────

const MOCK_LEADS: ApolloLeadResult[] = [
  { apolloId: 'apollo_001', firstName: 'Pierre',   lastName: 'Martin',    email: 'p.martin@techvision.fr',    title: 'CTO',                   company: 'TechVision',   industry: 'Software',            linkedinUrl: null, country: 'France', website: 'techvision.fr',   hasEmail: true },
  { apolloId: 'apollo_002', firstName: 'Sophie',   lastName: 'Lefèvre',   email: 's.lefevre@scalable.io',     title: 'VP Product',             company: 'Scalable',     industry: 'SaaS',                linkedinUrl: null, country: 'France', website: 'scalable.io',     hasEmail: true },
  { apolloId: 'apollo_003', firstName: 'Julien',   lastName: 'Dupont',    email: 'julien@dataflow.co',         title: 'CEO',                   company: 'DataFlow',     industry: 'Analytics',           linkedinUrl: null, country: 'France', website: 'dataflow.co',     hasEmail: true },
  { apolloId: 'apollo_004', firstName: 'Marie',    lastName: 'Lambert',   email: 'm.lambert@growthco.fr',      title: 'Head of Sales',         company: 'GrowthCo',     industry: 'Marketing',           linkedinUrl: null, country: 'France', website: 'growthco.fr',     hasEmail: true },
  { apolloId: 'apollo_005', firstName: 'Thomas',   lastName: 'Bernard',   email: 't.bernard@cloudnine.io',     title: 'CTO',                   company: 'CloudNine',    industry: 'Cloud Computing',     linkedinUrl: null, country: 'France', website: 'cloudnine.io',    hasEmail: true },
  { apolloId: 'apollo_006', firstName: 'Camille',  lastName: 'Girard',    email: 'c.girard@innovlab.fr',       title: 'VP Engineering',        company: 'InnoLab',      industry: 'Technology',          linkedinUrl: null, country: 'France', website: 'innovlab.fr',     hasEmail: true },
  { apolloId: 'apollo_007', firstName: 'Antoine',  lastName: 'Rousseau',  email: 'a.rousseau@salesmetrics.fr', title: 'Directeur Commercial',  company: 'SalesMetrics', industry: 'CRM',                 linkedinUrl: null, country: 'France', website: 'salesmetrics.fr', hasEmail: true },
  { apolloId: 'apollo_008', firstName: 'Emma',     lastName: 'Petit',     email: 'emma@startpix.co',           title: 'CEO',                   company: 'StartPix',     industry: 'Tech Startup',        linkedinUrl: null, country: 'France', website: 'startpix.co',     hasEmail: true },
  { apolloId: 'apollo_009', firstName: 'Lucas',    lastName: 'Moreau',    email: 'l.moreau@brandboost.fr',     title: 'Head of Marketing',     company: 'BrandBoost',   industry: 'Marketing',           linkedinUrl: null, country: 'France', website: 'brandboost.fr',   hasEmail: true },
  { apolloId: 'apollo_010', firstName: 'Clara',    lastName: 'Simon',     email: 'c.simon@opsmetrics.io',      title: 'VP Operations',         company: 'OpsMetrics',   industry: 'Operations',          linkedinUrl: null, country: 'France', website: 'opsmetrics.io',   hasEmail: true },
  { apolloId: 'apollo_011', firstName: 'Nicolas',  lastName: 'Fontaine',  email: 'n.fontaine@nexatech.fr',     title: 'CTO',                   company: 'NexaTech',     industry: 'Software',            linkedinUrl: null, country: 'France', website: 'nexatech.fr',     hasEmail: true },
  { apolloId: 'apollo_012', firstName: 'Isabelle', lastName: 'Garnier',   email: 'i.garnier@automate.io',      title: 'VP Sales',              company: 'Automate',     industry: 'Automation',          linkedinUrl: null, country: 'France', website: 'automate.io',     hasEmail: true },
  { apolloId: 'apollo_013', firstName: 'Maxime',   lastName: 'Chevalier', email: 'm.chevalier@pixelcore.fr',   title: 'CEO',                   company: 'PixelCore',    industry: 'Digital',             linkedinUrl: null, country: 'France', website: 'pixelcore.fr',    hasEmail: true },
  { apolloId: 'apollo_014', firstName: 'Léa',      lastName: 'Faure',     email: 'l.faure@revopsteam.fr',      title: 'RevOps Director',       company: 'RevOpsTeam',   industry: 'Revenue Operations',  linkedinUrl: null, country: 'France', website: 'revopsteam.fr',   hasEmail: true },
  { apolloId: 'apollo_015', firstName: 'Baptiste', lastName: 'Morel',     email: 'b.morel@cloudify.io',        title: 'Head of Engineering',   company: 'Cloudify',     industry: 'Cloud',               linkedinUrl: null, country: 'France', website: 'cloudify.io',     hasEmail: true },
]

// ─── Main search function ─────────────────────────────────────────────────────

export async function searchApolloLeads(params: ApolloSearchParams): Promise<ApolloSearchResult> {
  const apiKey = process.env.APOLLO_API_KEY

  // Dev / CI: no key configured
  if (!apiKey) {
    console.warn('[Apollo] APOLLO_API_KEY not set: using mock data')
    const start = (params.page - 1) * params.limit
    const sliced = MOCK_LEADS.slice(start, start + params.limit)
    return {
      leads:      sliced,
      pagination: { total: MOCK_LEADS.length, page: params.page, perPage: params.limit },
    }
  }

  // ── Build URL with query parameters (as required by the API spec) ────────────
  const url = new URL('https://api.apollo.io/api/v1/mixed_people/api_search')

  // ── Tier 1: basic (FREE) ──────────────────────────────────────────────
  if (params.jobTitles?.length) {
    params.jobTitles.forEach((t) => url.searchParams.append('person_titles[]', t))
  }
  if (params.country) {
    url.searchParams.append('person_locations[]', params.country)
  }
  if (params.companySizes?.length) {
    params.companySizes.forEach((s) =>
      url.searchParams.append('organization_num_employees_ranges[]', SIZE_TO_APOLLO_RANGE[s])
    )
  }
  // CRITICAL fix: was: url.searchParams.set('q_keywords', params.industry)
  // Why: `q_keywords` does PHRASE-EXACT search across the entire record.
  // "SaaS B2B" returned only ~2 results worldwide. Apollo expects either:
  //   (a) organization_industry_tag_ids[]: taxonomy IDs (need lookup)
  //   (b) q_organization_keyword_tags[]: company-tag fuzzy match (better)
  // We split the industry into individual words and send each as a keyword tag.
  // This matches companies tagged with ANY of these words (OR semantics).
  if (params.industry) {
    const words = params.industry
      .split(/[\s,;/&-]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2)
    if (words.length > 0) {
      words.forEach((w) => url.searchParams.append('q_organization_keyword_tags[]', w))
    }
  }

  // ── Tier 2: advanced (PRO) ────────────────────────────────────────────
  if (params.seniorities?.length) {
    params.seniorities.forEach((s) => url.searchParams.append('person_seniorities[]', s))
  }
  if (params.jobFunctions?.length) {
    params.jobFunctions.forEach((f) => url.searchParams.append('current_job_function[]', f))
  }
  if (params.multiCountries?.length) {
    params.multiCountries.forEach((c) => url.searchParams.append('person_locations[]', c))
  }
  if (params.emailStatus?.length) {
    params.emailStatus.forEach((s) => url.searchParams.append('person_email_status[]', s))
  }
  if (params.excludeDomains?.length) {
    params.excludeDomains.forEach((d) => url.searchParams.append('q_not_organization_domains_list[]', d))
  }
  if (params.companyKeywords?.length) {
    params.companyKeywords.forEach((k) => url.searchParams.append('q_organization_keyword_tags[]', k))
  }

  // ── Tier 3: expert (BUSINESS) ─────────────────────────────────────────
  if (params.organizationLocations?.length) {
    params.organizationLocations.forEach((l) => url.searchParams.append('organization_locations[]', l))
  }
  if (params.excludeLocations?.length) {
    params.excludeLocations.forEach((l) => url.searchParams.append('person_not_locations[]', l))
  }
  if (params.fundingRounds?.length) {
    params.fundingRounds.forEach((f) => url.searchParams.append('organization_funding_rounds[]', f))
  }
  if (typeof params.revenueMin === 'number') {
    url.searchParams.set('revenue_range[min]', String(params.revenueMin))
  }
  if (typeof params.revenueMax === 'number') {
    url.searchParams.set('revenue_range[max]', String(params.revenueMax))
  }
  if (typeof params.foundedYearMin === 'number') {
    url.searchParams.set('organization_founded_year_range[min]', String(params.foundedYearMin))
  }
  if (typeof params.foundedYearMax === 'number') {
    url.searchParams.set('organization_founded_year_range[max]', String(params.foundedYearMax))
  }

  // ── Tier 4: max (ENTERPRISE) ──────────────────────────────────────────
  if (params.recentlyJoined) {
    url.searchParams.set('recently_joined_company', 'true')
  }
  if (params.recentFundingRounds?.length) {
    params.recentFundingRounds.forEach((f) => url.searchParams.append('recent_funding_rounds[]', f))
  }
  if (params.recentNews) {
    url.searchParams.set('recent_news', 'true')
  }
  if (params.usingTechAny?.length) {
    params.usingTechAny.forEach((t) => url.searchParams.append('currently_using_any_of_technology_uids[]', t))
  }
  if (params.usingTechAll?.length) {
    params.usingTechAll.forEach((t) => url.searchParams.append('currently_using_all_of_technology_uids[]', t))
  }
  if (params.notUsingTech?.length) {
    params.notUsingTech.forEach((t) => url.searchParams.append('currently_not_using_any_of_technology_uids[]', t))
  }
  if (params.pastOrganizations?.length) {
    params.pastOrganizations.forEach((o) => url.searchParams.append('person_past_organizations_ids[]', o))
  }
  if (params.industryTagIds?.length) {
    params.industryTagIds.forEach((i) => url.searchParams.append('organization_industry_tag_ids[]', i))
  }

  // Pagination
  url.searchParams.set('page',     String(params.page))
  url.searchParams.set('per_page', String(Math.min(params.limit, 100))) // max 100/page

  // API key: passed both as header AND query param for maximum compatibility
  // across Apollo plan tiers (some plans only accept one or the other)
  url.searchParams.set('api_key', apiKey)

  // ── Execute request ──────────────────────────────────────────────────────────
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'x-api-key':     apiKey,
        'Cache-Control': 'no-cache',
        'Content-Type':  'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })

    // ── Error handling ─────────────────────────────────────────────────────────
    if (res.status === 401) {
      throw new Error('[Apollo] Clé API invalide : vérifiez APOLLO_API_KEY dans les env vars')
    }

    if (res.status === 403) {
      const body = await res.json().catch(() => ({ error_code: 'UNKNOWN', error: 'Accès refusé' })) as { error_code?: string; error?: string }
      if (body.error_code === 'API_INACCESSIBLE') {
        throw new Error(
          '[Apollo] Clé API non autorisée pour cet endpoint : utilisez une Master API Key (Settings > API Keys > Create Master Key)'
        )
      }
      throw new Error(`[Apollo] 403 Forbidden : ${body.error ?? 'Accès refusé'}`)
    }

    if (res.status === 422) {
      const body = await res.json().catch(() => ({ error: 'Paramètres invalides' })) as { error?: string }
      throw new Error(`[Apollo] Paramètres invalides : ${body.error ?? ''}`)
    }

    if (res.status === 429) {
      throw new Error('[Apollo] Rate limit atteint (600 req/h) : réessayez dans quelques minutes')
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '(no body)')
      throw new Error(`[Apollo] Erreur ${res.status} : ${text}`)
    }

    // ── Parse response ─────────────────────────────────────────────────────────
    const data = (await res.json()) as ApolloApiSearchResponse

    const leads: ApolloLeadResult[] = (data.people ?? []).map((p) => ({
      apolloId:    p.id,
      firstName:   p.first_name,
      lastName:    p.last_name_obfuscated,   // obfuscated (e.g. "Do***e")
      email:       null,                     // not returned — use enrichment endpoint
      title:       p.title,
      company:     p.organization?.name ?? null,
      industry:    null,                     // not returned — use enrichment endpoint
      linkedinUrl: null,                     // not returned — use enrichment endpoint
      country:     null,                     // not returned as string — only boolean flag
      // Domain comes free with search: feeds the waterfall when Apollo has no
      // enrichment credits. Enrichment (bulk_match) still overrides it later.
      website:     p.organization?.primary_domain ?? p.organization?.website_url ?? null,
      hasEmail:    p.has_email,              // hint for enrichment priority
    }))

    return {
      leads,
      pagination: {
        total:   data.total_entries,
        page:    params.page,
        perPage: params.limit,
      },
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('[Apollo] Timeout : réessayez avec un per_page plus petit')
    }
    throw err
  }
}

// ─── People Enrichment via bulk_match ─────────────────────────────────────────
//
// Uses the apollo_id from search results to retrieve:
//   - Real (non-obfuscated) last name
//   - Real work email
//   - Industry, LinkedIn URL, country
//
// Consumes 1 export credit per lead with an email found.
// Apollo Basic plan includes 250 export credits/month.
// Max 10 people per request (Apollo limit).
//
// On 402 (no credits) -> graceful fallback, all emails null.

function makeNullEnrichResult(
  lead: Pick<ApolloLeadResult, 'apolloId' | 'firstName' | 'lastName' | 'company'>
): ApolloEnrichResult {
  return {
    apolloId:    lead.apolloId,
    email:       null,
    firstName:   lead.firstName,
    lastName:    lead.lastName,
    title:       null,
    company:     lead.company,
    industry:    null,
    linkedinUrl: null,
    country:     null,
    headline:           null,
    city:               null,
    companyWebsite:     null,
    companyDescription: null,
    companyLinkedinUrl: null,
    technologies:       [],
  }
}

export async function enrichApolloLeadsBatch(
  leads: Array<Pick<ApolloLeadResult, 'apolloId' | 'firstName' | 'lastName' | 'company'>>,
  options: { batchSize?: number; delayMs?: number } = {},
): Promise<ApolloEnrichResult[]> {
  const apiKey = process.env.APOLLO_API_KEY

  if (!apiKey) {
    console.warn('[Apollo] APOLLO_API_KEY not set: enrichment skipped')
    return leads.map(makeNullEnrichResult)
  }

  const { batchSize = 10, delayMs = 500 } = options
  const results: ApolloEnrichResult[] = []
  // Stopping Apollo (bad key, no credits) must not drop the leads of the
  // remaining batches: they go on to the email waterfall without Apollo data.
  const stopAt = (index: number) => {
    leads.slice(index).forEach((l) => results.push(makeNullEnrichResult(l)))
  }

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize)

    try {
      const res = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
        method:  'POST',
        headers: {
          'x-api-key':     apiKey,
          'Content-Type':  'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          reveal_personal_emails: false,
          reveal_phone_number:    false,
          details: batch.map((l) => ({
            id:                l.apolloId,
            first_name:        l.firstName,
            organization_name: l.company ?? undefined,
          })),
        }),
        signal: AbortSignal.timeout(20_000),
      })

      if (res.status === 401) {
        console.error('[Apollo] Enrichment: clé API invalide')
        stopAt(i)
        break
      }

      if (res.status === 402) {
        console.warn('[Apollo] Enrichment: crédits export épuisés: fallback Hunter')
        stopAt(i)
        break
      }

      // 422 "insufficient credits": Apollo lead credits exhausted. Without this
      // hard stop the loop replays the same 422 for EVERY batch (~20 calls) and
      // then dumps all leads onto Hunter, blowing past Vercel's 60s timeout.
      // Break immediately and let the remaining leads fall back gracefully.
      if (res.status === 422) {
        const text = await res.text().catch(() => '')
        if (/credit/i.test(text)) {
          console.warn('[Apollo] Enrichment: crédits lead épuisés (422): arrêt enrichissement Apollo')
          stopAt(i)
          break
        }
        console.warn(`[Apollo] Enrichment erreur 422: ${text}`)
        batch.forEach((l) => results.push(makeNullEnrichResult(l)))
        continue
      }

      if (res.status === 429) {
        console.warn('[Apollo] Enrichment: rate limit: pause 2s')
        await new Promise((r) => setTimeout(r, 2_000))
        batch.forEach((l) => results.push(makeNullEnrichResult(l)))
        continue
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '(no body)')
        console.warn(`[Apollo] Enrichment erreur ${res.status}: ${text}`)
        batch.forEach((l) => results.push(makeNullEnrichResult(l)))
        continue
      }

      const data = (await res.json()) as ApolloBulkMatchResponse & {
        // Newer Apollo response shape: credits live under different keys
        credit_usage?: { used?: number; remaining?: number; rate_limit?: { remaining?: number } }
        usage?:        { credits_used?: number; credits_remaining?: number }
      }

      // Defensive lookup: Apollo has shipped multiple response shapes for
      // bulk_match. We probe the known paths and only log if we find data.
      const used      = data.credits_used     ?? data.credit_usage?.used     ?? data.usage?.credits_used
      const remaining = data.credits_remaining ?? data.credit_usage?.remaining ?? data.usage?.credits_remaining
      const matches   = data.matches?.length ?? 0

      if (typeof used === 'number' || typeof remaining === 'number') {
        console.info(
          `[Apollo] Enrichment: ${used ?? '?'} crédits utilisés, ` +
          `${remaining ?? '?'} restants: ${matches} matches`
        )
      } else {
        // No credit info in response: log match count only, avoids "?" noise
        console.info(`[Apollo] Enrichment: ${matches} matches (credits info unavailable in response)`)
      }

      // Map by id for O(1) lookup: preserves original batch order
      const matchById = new Map<string, ApolloBulkPersonRaw>(
        (data.matches ?? []).map((m) => [m.id, m])
      )

      for (const lead of batch) {
        const m = matchById.get(lead.apolloId)
        results.push({
          apolloId:    lead.apolloId,
          email:       m?.email       ?? null,
          firstName:   m?.first_name  ?? lead.firstName,
          lastName:    m?.last_name   ?? lead.lastName,
          title:       m?.title       ?? null,
          company:     m?.organization?.name ?? lead.company,
          industry:    m?.organization?.industry ?? null,
          linkedinUrl: m?.linkedin_url ?? null,
          country:     m?.country     ?? null,
          headline:           m?.headline ?? null,
          city:               m?.city ?? null,
          companyWebsite:     m?.organization?.website_url ?? null,
          companyDescription: m?.organization?.short_description ?? null,
          companyLinkedinUrl: m?.organization?.linkedin_url ?? null,
          technologies:       (m?.organization?.technology_names ?? []).slice(0, 12),
        })
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        console.warn('[Apollo] Enrichment timeout pour ce batch')
      } else {
        console.error('[Apollo] Enrichment erreur inattendue:', err)
      }
      batch.forEach((l) => results.push(makeNullEnrichResult(l)))
    }

    if (i + batchSize < leads.length) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  return results
}
