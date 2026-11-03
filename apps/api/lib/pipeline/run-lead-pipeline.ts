/**
 * Phantera: Lead pipeline core (transport-agnostic).
 *
 * Runs the prospecting pipeline up to (and including) scoring:
 *   search (over-fetch + dedup) -> enrich (Apollo + waterfall) -> save -> verify ->
 *   score -> mark fast-track.
 *
 * It deliberately does NOT send emails: sending is delegated to the durable
 * `campaignProcessor` Inngest function (idempotent, rate-limited, retried). It
 * also emits no SSE events, so it can run inside an Inngest step (durable,
 * decoupled from the user request, no Vercel single-request timeout) OR be
 * called from anywhere else.
 *
 * All the heavy lifting reuses the same battle-tested service functions as the
 * legacy SSE route: this is the single source of truth for collection logic.
 */

import { db } from '@/lib/db'
import { withoutOptedOut } from '@/lib/privacy/opt-out'
import { attachToCampaign, heldByColleague } from '@/lib/leads/attach-to-campaign'
import { searchApolloLeads, enrichApolloLeadsBatch } from '@/lib/services/apollo'
import { enrichEmailsWaterfall } from '@/lib/enrichment/enrich-batch'
import { configuredProviders } from '@/lib/enrichment/providers'
import { extractDomain } from '@/lib/enrichment/domain'
import { verifyEmailBatch } from '@/lib/services/hunter'
import { scoreLeads, scoreUpdate } from '@/lib/agents/lead-scorer'
import { checkLeadQuota, maybeFireLeadQuotaWarning } from '@/lib/stripe/quota'
import type { CompanySize, LeadScoreBadge } from '@/lib/types/lead'

export interface LeadPipelineParams {
  workspaceId:   string
  campaignId?:   string
  jobTitles:     string[]
  industry?:     string
  companySizes?: CompanySize[]
  country?:      string
  limit:         number
  page?:         number
}

export interface LeadPipelineResult {
  candidates:   number
  saved:        number
  duplicates:   number
  verified:     number
  distribution: Record<LeadScoreBadge, number>
  savedLeadIds: string[]
  quotaHit:     boolean
  error:        string | null
}

/** Apollo profile extras persisted alongside verification (JSON-serializable so
 *  it can cross Inngest step boundaries). Keyed by apolloId. */
export type LeadExtras = Record<string, {
  headline: string | null
  city: string | null
  companyDescription: string | null
  companyLinkedinUrl: string | null
  technologies: string[]
}>

/** Phases 1-3 result: everything needed by the later verify/score steps. */
export interface CollectResult {
  candidates:   number
  saved:        number
  duplicates:   number
  savedLeadIds: string[]
  quotaHit:     boolean
  error:        string | null
  extras:       LeadExtras
}

const EMPTY_DISTRIBUTION = (): Record<LeadScoreBadge, number> =>
  ({ FAST_TRACK: 0, NORMAL: 0, NURTURE: 0, SKIP: 0, UNSCORED: 0 })

/**
 * Phases 1-3: search -> enrich -> save. Split from verify/score so each phase can
 * run as its OWN durable Inngest step: the monolithic version exceeded
 * Vercel's 300s limit when Hunter verification timed out lead-by-lead,
 * killing scoring and sending after the leads were already saved (2026-07-11).
 */
export async function collectAndSaveLeads(params: LeadPipelineParams): Promise<CollectResult> {
  const result: CollectResult = {
    candidates: 0, saved: 0, duplicates: 0,
    savedLeadIds: [], quotaHit: false, error: null, extras: {},
  }

  // ── Phase 1: Search (over-fetch + dedup) ───────────────────────────────────
  type ApolloLead = Awaited<ReturnType<typeof searchApolloLeads>>['leads'][number]

  // Never pay for more leads than the plan can still store this month: the
  // quota used to be applied only at save time, after Apollo and the email
  // waterfall had already been paid for every candidate.
  const headroom = await checkLeadQuota(params.workspaceId)
  if (!headroom.allowed) {
    result.quotaHit = true
    return result
  }
  const remaining  = headroom.limit === Infinity ? Infinity : headroom.limit - headroom.current
  const TARGET_NEW = Math.min(params.limit, remaining)
  const PER_PAGE   = 100
  const MAX_PAGES  = Math.min(50, Math.ceil(TARGET_NEW / PER_PAGE) + 10)
  const startPage  = params.page ?? 1

  const candidateLeads: ApolloLead[] = []
  const seenApolloIds = new Set<string>()
  let apolloTotal = 0

  for (let p = startPage; p < startPage + MAX_PAGES; p++) {
    let pageResult: Awaited<ReturnType<typeof searchApolloLeads>>
    try {
      pageResult = await searchApolloLeads({ ...params, page: p, limit: PER_PAGE })
    } catch (err) {
      if (p === startPage) { result.error = err instanceof Error ? err.message : 'Erreur Apollo'; return result }
      break
    }
    apolloTotal = pageResult.pagination.total

    const withCompany = pageResult.leads.filter(
      (l) => !!l.company && l.apolloId && !seenApolloIds.has(l.apolloId),
    )
    withCompany.forEach((l) => l.apolloId && seenApolloIds.add(l.apolloId))

    const ids = withCompany.map((l) => l.apolloId).filter((x): x is string => !!x)
    const existing = ids.length
      ? await db.lead.findMany({ where: { workspaceId: params.workspaceId, apolloId: { in: ids } }, select: { apolloId: true } })
      : []
    const knownIds = new Set(existing.map((e) => e.apolloId))
    candidateLeads.push(...withCompany.filter((l) => !knownIds.has(l.apolloId)))

    if (candidateLeads.length >= TARGET_NEW) break
    if (pageResult.leads.length < PER_PAGE) break
    if (p * PER_PAGE >= apolloTotal) break
  }
  if (candidateLeads.length > TARGET_NEW) candidateLeads.length = TARGET_NEW
  result.candidates = candidateLeads.length

  if (candidateLeads.length === 0) {
    result.error = 'Aucun prospect trouvé chez Apollo pour ces filtres.'
    return result
  }

  // ── Phase 2: Enrich (Apollo bulk_match -> waterfall) ────────────────────────
  const apolloEnriched = await enrichApolloLeadsBatch(
    candidateLeads.map((l) => ({ apolloId: l.apolloId, firstName: l.firstName, lastName: l.lastName, company: l.company })),
    { batchSize: 10, delayMs: 500 },
  )

  const apolloMiss = apolloEnriched.filter((r) => !r.email)

  for (const r of apolloEnriched) {
    if (r.headline || r.companyDescription || r.technologies.length > 0 || r.city || r.companyLinkedinUrl) {
      result.extras[r.apolloId] = {
        headline: r.headline, city: r.city, companyDescription: r.companyDescription,
        companyLinkedinUrl: r.companyLinkedinUrl, technologies: r.technologies,
      }
    }
  }

  const MAX_FALLBACK = 80
  let fallbackResults: Array<{ email: string | null }> = []
  if (apolloMiss.length > 0) {
    const candidateByApolloId = new Map(candidateLeads.map((l) => [l.apolloId, l]))
    // Apollo can return null names on partial profiles: never assume strings.
    const fallbackTargets = apolloMiss.slice(0, MAX_FALLBACK).map((r) => ({
      firstName: r.firstName ?? '',
      lastName:  (r.lastName ?? '').replace(/[^a-zA-ZÀ-ÿ\s\-']/g, '').trim() || r.firstName || '',
      company:   r.company,
      domain:    extractDomain(r.companyWebsite ?? candidateByApolloId.get(r.apolloId)?.website ?? null),
    }))

    // Diagnostic: reveals WHY the waterfall yields little: which providers are
    // configured, and how many leads actually have a usable domain (the cheap
    // providers need a domain; Apollo's free search may not return one).
    console.log('[lead-pipeline] waterfall-diagnostic', JSON.stringify({
      apolloHits:          apolloEnriched.length - apolloMiss.length,
      apolloMisses:        apolloMiss.length,
      attempting:          fallbackTargets.length,
      withDomain:          fallbackTargets.filter((t) => !!t.domain).length,
      configuredProviders: configuredProviders().map((p) => p.name),
    }))

    const enriched = await enrichEmailsWaterfall(fallbackTargets, { concurrency: 5, deadlineMs: 120_000 })
    fallbackResults = enriched.map((e) => ({ email: e.email }))
    console.log('[lead-pipeline] waterfall-result', JSON.stringify({
      found: enriched.filter((e) => e.email).length,
      bySource: enriched.reduce<Record<string, number>>((acc, e) => {
        if (e.email && e.source) acc[e.source] = (acc[e.source] ?? 0) + 1
        return acc
      }, {}),
    }))
  }

  // Merge into leads-with-email
  const apolloMissIndex = new Map(apolloMiss.map((r, i) => [r.apolloId, i]))
  type EnrichedLead = ApolloLead & { email: string; lastName: string; industry: string | null; linkedinUrl: string | null }
  const leadsWithEmail: EnrichedLead[] = []

  for (const lead of candidateLeads) {
    const enriched = apolloEnriched.find((r) => r.apolloId === lead.apolloId)
    const apolloEmail = enriched?.email ?? null

    if (apolloEmail) {
      leadsWithEmail.push({
        ...lead,
        email:       apolloEmail.toLowerCase().trim(),
        lastName:    enriched?.lastName    ?? lead.lastName,
        title:       enriched?.title       ?? lead.title,
        industry:    enriched?.industry    ?? lead.industry,
        linkedinUrl: enriched?.linkedinUrl ?? lead.linkedinUrl,
        country:     enriched?.country     ?? lead.country,
        company:     enriched?.company     ?? lead.company,
        website:     enriched?.companyWebsite ?? lead.website,
      })
      continue
    }

    const missIdx = apolloMissIndex.get(lead.apolloId)
    const fallbackEmail = missIdx !== undefined ? (fallbackResults[missIdx]?.email ?? null) : null
    if (fallbackEmail) {
      leadsWithEmail.push({
        ...lead,
        email:       fallbackEmail.toLowerCase().trim(),
        lastName:    enriched?.lastName    ?? lead.lastName,
        industry:    enriched?.industry    ?? lead.industry,
        linkedinUrl: enriched?.linkedinUrl ?? lead.linkedinUrl,
      })
    }
  }

  // ── Phase 3: Save (quota-capped upsert) ────────────────────────────────────
  const quotaSnapshot = await checkLeadQuota(params.workspaceId)
  const quotaCeiling  = quotaSnapshot.limit === Infinity ? Infinity : quotaSnapshot.limit
  let quotaCurrent    = quotaSnapshot.current

  // A lead already in another member's campaign stays theirs: not refreshed,
  // scored nor queued here. « Another » than the owner of the campaign filled.
  const acting = params.campaignId
    ? (await db.campaign.findUnique({ where: { id: params.campaignId }, select: { ownerUserId: true } }))?.ownerUserId
    : (await db.workspace.findUnique({ where: { id: params.workspaceId }, select: { ownerId: true } }))?.ownerId
  if (!acting) return result

  // An address that objected to this workspace is never stored again.
  for (const lead of await withoutOptedOut(db, params.workspaceId, leadsWithEmail)) {
    if (quotaCeiling !== Infinity && quotaCurrent >= quotaCeiling) { result.quotaHit = true; break }
    if (await heldByColleague(db, params.workspaceId, { email: lead.email }, acting)
      || (lead.apolloId && await heldByColleague(db, params.workspaceId, { apolloId: lead.apolloId }, acting))) {
      result.duplicates++
      continue
    }
    try {
      const existingByApolloId = lead.apolloId
        ? await db.lead.findFirst({ where: { workspaceId: params.workspaceId, apolloId: lead.apolloId }, select: { id: true } })
        : null

      const data = {
        firstName: lead.firstName, lastName: lead.lastName, email: lead.email,
        company: lead.company, title: lead.title, industry: lead.industry,
        linkedinUrl: lead.linkedinUrl, website: lead.website, country: lead.country,
      }

      let saved
      if (existingByApolloId) {
        saved = await db.lead.update({
          where: { id: existingByApolloId.id },
          data,
        })
      } else {
        saved = await db.lead.upsert({
          where:  { workspaceId_email: { workspaceId: params.workspaceId, email: lead.email } },
          create: { workspaceId: params.workspaceId, campaignId: params.campaignId ?? null, source: 'APOLLO', apolloId: lead.apolloId, ...data },
          update: data,
        })
      }
      result.savedLeadIds.push(saved.id)
      result.saved++
      quotaCurrent++
    } catch {
      result.duplicates++
    }
  }

  // Into the campaign, except leads running in a colleague's campaign.
  if (params.campaignId) {
    await attachToCampaign(db, { workspaceId: params.workspaceId, campaignId: params.campaignId, leadIds: result.savedLeadIds })
  }

  void maybeFireLeadQuotaWarning(params.workspaceId).catch(() => null)
  return result
}

// ── Phase 4: Verify deliverability + persist enrichment extras ───────────────

/**
 * Verifies a CHUNK of saved leads (Hunter) and persists results + Apollo extras.
 * Designed to be called per-chunk from separate Inngest steps: Hunter timeouts
 * on one chunk no longer starve the whole pipeline's time budget.
 */
export async function verifyLeadsChunk(leadIds: string[], extras: LeadExtras): Promise<number> {
  if (leadIds.length === 0) return 0
  let verified = 0

  const leadsToVerify = await db.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, email: true, apolloId: true },
  })
  const verifications = await verifyEmailBatch(leadsToVerify.map((l) => l.email), { concurrency: 3, delayMs: 200 })

  await Promise.allSettled(
    leadsToVerify.map(async (lead, i) => {
      const v = verifications[i]
      if (!v) return
      const leadExtras = lead.apolloId ? extras[lead.apolloId] ?? null : null
      await db.leadEnrichment.upsert({
        where:  { leadId: lead.id },
        create: { leadId: lead.id, emailVerified: v.verified, emailConfidence: v.confidence, emailStatus: v.status, linkedinData: leadExtras ?? undefined, enrichedAt: new Date() },
        update: { emailVerified: v.verified, emailConfidence: v.confidence, emailStatus: v.status, ...(leadExtras ? { linkedinData: leadExtras } : {}), enrichedAt: new Date() },
      })
      if (v.verified) verified++
    }),
  )
  return verified
}

// ── Phase 5: Score ─────────────────────────────────────────────────────────────

/** Scores saved leads against the workspace ICP. Own Inngest step. */
export async function scoreSavedLeads(
  params: LeadPipelineParams,
  savedLeadIds: string[],
): Promise<Record<LeadScoreBadge, number>> {
  const distribution = EMPTY_DISTRIBUTION()
  if (savedLeadIds.length === 0) return distribution

  const workspace = await db.workspace.findUnique({
    where: { id: params.workspaceId },
    select: { targetIndustry: true, targetCompanySize: true },
  })
  const leadsForScoring = await db.lead.findMany({
    where: { id: { in: savedLeadIds } },
    select: {
      id: true, firstName: true, lastName: true, title: true, company: true,
      industry: true, country: true, companySize: true,
      enrichment: { select: { emailConfidence: true } },
    },
  })

  const scoreResults = await scoreLeads(
    leadsForScoring.map((l) => ({
      id: l.id, firstName: l.firstName, lastName: l.lastName, title: l.title,
      company: l.company, industry: l.industry, country: l.country,
      companySize: l.companySize, emailConfidence: l.enrichment?.emailConfidence ?? null,
    })),
    { targetIndustry: workspace?.targetIndustry ?? null, targetCompanySize: workspace?.targetCompanySize ?? null },
    {
      targetTitles:       params.jobTitles ?? [],
      targetCompanySizes: params.companySizes ?? [],
      targetGeos:         params.country ? [params.country] : [],
      goal:               'LEADS',
    },
  )

  await Promise.allSettled(
    scoreResults.map(async (r) => {
      const { count } = await db.lead.updateMany({ where: { id: r.leadId }, data: scoreUpdate(r) })
      if (count > 0) distribution[r.badge]++
    }),
  )

  // NB: we deliberately do NOT pre-mark leads as 'queued' here. Status stays
  // 'new' until an email is actually sent (sendStepToLead flips 'new' ->
  // 'contacted'), so the status badge always reflects reality.

  return distribution
}

// ── Composition (non-Inngest callers / tests) ─────────────────────────────────

/** Full pipeline in one call. Inngest uses the split phases as separate steps
 *  instead: see lib/inngest/lead-pipeline.ts. */
export async function runLeadPipeline(params: LeadPipelineParams): Promise<LeadPipelineResult> {
  const collect = await collectAndSaveLeads(params)
  const verified = await verifyLeadsChunk(collect.savedLeadIds, collect.extras)
  const distribution = await scoreSavedLeads(params, collect.savedLeadIds)
  return {
    candidates: collect.candidates, saved: collect.saved, duplicates: collect.duplicates,
    verified, distribution, savedLeadIds: collect.savedLeadIds,
    quotaHit: collect.quotaHit, error: collect.error,
  }
}
