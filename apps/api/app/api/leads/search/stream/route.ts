/**
 * POST /api/leads/search/stream
 *
 * SSE endpoint: full pipeline in one call:
 * Apollo search -> Hunter enrichment -> AI scoring
 *
 * Emits progress events in real-time via Server-Sent Events.
 * Set maxDuration = 60 for Vercel Pro (streaming routes).
 *
 * SSE event types: see PipelineEvent in lib/types/lead.ts
 */

import { after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { withoutOptedOut } from '@/lib/privacy/opt-out'
import { apolloSearchSchema } from '@/lib/types/lead'
import { searchApolloLeads, enrichApolloLeadsBatch } from '@/lib/services/apollo'
import { serveFromPool, upsertLeadsIntoPool } from '@/lib/leads/pool'
import { verifyEmailBatch } from '@/lib/services/hunter'
import { enrichEmailsWaterfall } from '@/lib/enrichment/enrich-batch'
import { extractDomain } from '@/lib/enrichment/domain'
import { scoreLeads, scoreUpdate } from '@/lib/agents/lead-scorer'
import { checkLeadQuota, maybeFireLeadQuotaWarning } from '@/lib/stripe/quota'
import { getAllowedFilters, type FilterKey } from '@/lib/types/search-filters'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { campaignScope } from '@/lib/auth/scope'
import { attachToCampaign, heldByColleague } from '@/lib/leads/attach-to-campaign'
import { getClientKey, tooManyRequests } from '@/lib/security/rate-limit'
import { limit } from '@/lib/security/shared-rate-limit'
import type { PipelineEvent, LeadScoreBadge } from '@/lib/types/lead'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 300s = Vercel Pro ceiling (requires the Pro plan: on Hobby the build fails
// because Hobby caps at 60s). Lets the full pipeline (search -> enrich 200 ->
// score -> copy -> send) complete for typical volumes. For 500+ leads or true
// scale, migrate to a durable Inngest job (no time cap).
export const maxDuration = 300

async function held(workspaceId: string, lead: { email: string; apolloId?: string | null }, actingUserId: string): Promise<boolean> {
  return (await heldByColleague(db, workspaceId, { email: lead.email }, actingUserId))
    || (lead.apolloId ? await heldByColleague(db, workspaceId, { apolloId: lead.apolloId }, actingUserId) : false)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 })
  }

  // Rate-limit: the pipeline consumes Apollo + Hunter + Anthropic credits per call.
  // 10 launches per 5 minutes per user is generous for real usage but blocks abuse.
  const limitOpts = { windowSec: 300, max: 10, scope: 'leads:search:stream' }
  const limitResult = await limit(getClientKey(req, userId), limitOpts)
  if (!limitResult.allowed) {
    return tooManyRequests(limitResult, limitOpts.max)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400 })
  }

  const parsed = apolloSearchSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Paramètres invalides' }), { status: 422 })
  }

  const params = parsed.data

  // Loud entry diagnostic: proves the function was invoked in prod AND reveals
  // which provider keys are missing (the #1 cause of silent "0 leads" on Vercel:
  // env vars set locally in .env.local but never added to the Vercel project).
  console.log('[lead-pipeline] invoked', JSON.stringify({
    userId,
    workspaceId: params.workspaceId,
    limit:       params.limit,
    keys: {
      apollo:    !!process.env.APOLLO_API_KEY,
      hunter:    !!process.env.HUNTER_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
    },
  }))

  const workspaceAccess = await requireAccess(userId, 'lead.write', { workspaceId: params.workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // Leads found go into a campaign the caller runs (or sees as admin) of this
  // workspace: never one named by id from elsewhere.
  // A lead already in a colleague's campaign is left alone (lib/leads):
  // « colleague » of the campaign's owner, or of the person searching.
  let actingUserId = workspace.userId
  if (params.campaignId) {
    const own = await db.campaign.findFirst({ where: { id: params.campaignId, ...campaignScope(workspace) }, select: { ownerUserId: true } })
    if (!own) return new Response(JSON.stringify({ error: 'Campagne introuvable' }), { status: 404 })
    actingUserId = own.ownerUserId
  }

  // ── Plan gating: strip any filters the user's plan doesn't allow ──────────
  // This prevents tampering: even if the client UI exposes filters above the
  // user's tier, the server silently drops them before hitting Apollo.
  const allowed = new Set<FilterKey>(getAllowedFilters(workspace.plan))
  const ALL_FILTER_KEYS: FilterKey[] = [
    'jobTitles', 'industry', 'companySizes', 'country',
    'seniorities', 'jobFunctions', 'multiCountries', 'emailStatus',
    'excludeDomains', 'companyKeywords',
    'organizationLocations', 'excludeLocations', 'fundingRounds',
    'revenueMin', 'revenueMax', 'foundedYearMin', 'foundedYearMax',
    'recentlyJoined', 'recentFundingRounds', 'recentNews',
    'usingTechAny', 'usingTechAll', 'notUsingTech',
    'pastOrganizations', 'industryTagIds',
  ]
  for (const key of ALL_FILTER_KEYS) {
    if (!allowed.has(key)) {
      // Type-safe deletion: params is a known shape from Zod
      (params as Record<string, unknown>)[key] = undefined
    }
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Guard against double-close: controller.close() is in `finally` and
      // must not be called again from inside the try block.
      let controllerClosed = false
      const safeClose = () => {
        if (!controllerClosed) {
          controllerClosed = true
          // close() throws if the client already disconnected (the platform
          // cancels the stream on disconnect). The pipeline runs to completion
          // via after() regardless, so swallow this benign close error.
          try { controller.close() } catch { /* already closed by client */ }
        }
      }

      const emit = (event: PipelineEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Client disconnected
        }
      }

      // Detect client disconnect via Request abort signal. Once aborted, we
      // bail out before consuming more Apollo / Hunter / Anthropic credits.
      const isAborted = (): boolean => req.signal?.aborted === true
      req.signal?.addEventListener('abort', () => {
        console.info('[lead-pipeline] client disconnected: aborting pipeline')
        safeClose()
      })

      // Run the pipeline as a detached promise. On Vercel a streaming function
      // is frozen the instant the client disconnects: and the wizard redirects
      // ~4s after launch, killing the run before any lead is saved (works fine
      // on the long-lived local dev server, hence "works local, 0 leads prod").
      // after() registers the promise with the platform's waitUntil so the
      // function keeps executing to completion regardless of the connection.
      const pipeline = (async () => {
      try {
        // ── Phase 1: Search ───────────────────────────────────────────────
        if (isAborted()) return
        const quota = await checkLeadQuota(params.workspaceId)
        if (!quota.allowed) {
          emit({ type: 'error', message: `Quota de leads atteint (${quota.current}/${quota.limit})` })
          return
        }

        emit({ type: 'search_start', total: params.limit })

        if (isAborted()) return

        // ── Phase 0.5: POOL-FIRST (provider-cost optimizer) ─────────────────
        // Serve from Phantera's own GlobalLead pool BEFORE touching Apollo:
        // fully-enriched matches the workspace doesn't already own are saved
        // straight away (they skip discovery + verification entirely), and only
        // the REMAINDER goes to Apollo. Pool failures never break the pipeline.
        const poolSavedIds: string[] = []
        try {
          const quotaHeadroom = quota.limit === Infinity
            ? params.limit
            : Math.max(0, quota.limit - quota.current)
          const poolHits = await serveFromPool(
            params.workspaceId,
            {
              jobTitles:    params.jobTitles,
              industry:     params.industry,
              country:      params.country,
              companySizes: params.companySizes,
            },
            Math.min(params.limit, quotaHeadroom),
          )

          for (const hit of await withoutOptedOut(db, params.workspaceId, poolHits)) {
            if (isAborted()) return
            if (await held(params.workspaceId, hit, actingUserId)) continue
            try {
              const saved = await db.lead.upsert({
                where: { workspaceId_email: { workspaceId: params.workspaceId, email: hit.email } },
                create: {
                  workspaceId: params.workspaceId,
                  campaignId:  params.campaignId ?? null,
                  firstName:   hit.firstName,
                  lastName:    hit.lastName,
                  email:       hit.email,
                  company:     hit.company,
                  title:       hit.title,
                  industry:    hit.industry,
                  linkedinUrl: hit.linkedinUrl,
                  website:     hit.website,
                  country:     hit.country,
                  companySize: hit.companySize,
                  source:      hit.source,
                  apolloId:    hit.apolloId,
                },
                update: {},
              })
              // Enrichment snapshot travels with the pool row: no re-verification.
              await db.leadEnrichment.upsert({
                where:  { leadId: saved.id },
                create: {
                  leadId:          saved.id,
                  emailVerified:   hit.emailVerified,
                  emailConfidence: hit.emailConfidence,
                  emailStatus:     hit.emailStatus,
                  linkedinData:    hit.linkedinData ?? undefined,
                },
                update: {
                  emailVerified:   hit.emailVerified,
                  emailConfidence: hit.emailConfidence,
                  emailStatus:     hit.emailStatus,
                },
              })
              poolSavedIds.push(saved.id)
            } catch {
              // Row-level failure (rare unique race) — skip, Apollo will cover.
            }
          }

          if (poolSavedIds.length > 0) {
            emit({ type: 'search_progress', found: poolSavedIds.length })
            console.info('[lead-pipeline] pool-served', JSON.stringify({
              workspaceId: params.workspaceId,
              served:      poolSavedIds.length,
              requested:   params.limit,
            }))
          }
        } catch (err) {
          console.warn('[lead-pipeline] pool phase failed (non-fatal):',
            err instanceof Error ? err.message : String(err))
        }

        // ── Over-fetch + dedup loop ─────────────────────────────────────────
        // PROFESSIONAL GUARANTEE: a user who asks for N leads receives N *new*
        // leads: never a duplicate of someone already in their workspace.
        //
        // How: Apollo returns the same ranked page for the same filters, so a
        // naïve single-page fetch re-serves people the user already has. Instead
        // we page through Apollo (free: api_search consumes no credits),
        // dropping any apolloId already in the workspace BEFORE enrichment, and
        // keep paging until we've collected `params.limit` fresh candidates (or
        // exhausted the result set / hit the safety cap). This both removes
        // duplicates AND stops us wasting enrichment credits on known leads.
        type ApolloLead = Awaited<ReturnType<typeof searchApolloLeads>>['leads'][number]

        // Only the REMAINDER after the pool phase goes to Apollo. If the pool
        // covered everything, Apollo is never called (zero credits burned).
        // Capped by the plan's remaining monthly quota: paid enrichment beyond
        // what can be saved was wasted money.
        const quotaRemaining = quota.limit === Infinity ? Infinity : quota.limit - quota.current
        const TARGET_NEW = Math.max(0, Math.min(params.limit, quotaRemaining) - poolSavedIds.length)
        const PER_PAGE   = 100  // Apollo max page size: fetch wide, filter hard
        // Scale the page budget to the requested volume (+10 pages of headroom
        // to absorb dedup of already-known leads), capped at 50 pages (≤ 5000
        // records scanned) so a pathological run can't loop forever.
        const MAX_PAGES  = Math.min(50, Math.ceil(TARGET_NEW / PER_PAGE) + 10)
        const startPage  = params.page ?? 1

        const candidateLeads: ApolloLead[] = []
        const seenApolloIds = new Set<string>()
        let   apolloTotal   = 0
        let   pagesScanned  = 0

        for (let p = startPage; TARGET_NEW > 0 && p < startPage + MAX_PAGES; p++) {
          if (isAborted()) return

          let pageResult: Awaited<ReturnType<typeof searchApolloLeads>>
          try {
            pageResult = await searchApolloLeads({ ...params, page: p, limit: PER_PAGE })
          } catch (err) {
            // First page failing is fatal; a later page failing just stops paging
            // with whatever we already collected.
            if (p === startPage) {
              emit({ type: 'error', message: err instanceof Error ? err.message : 'Erreur Apollo' })
              return
            }
            break
          }
          apolloTotal = pageResult.pagination.total
          pagesScanned++

          // Keep leads with a company, not seen earlier in THIS run.
          const withCompany = pageResult.leads.filter(
            (l) => !!l.company && l.apolloId && !seenApolloIds.has(l.apolloId),
          )
          withCompany.forEach((l) => l.apolloId && seenApolloIds.add(l.apolloId))

          // Drop anyone already saved in this workspace (dedup BEFORE enrichment).
          const ids = withCompany.map((l) => l.apolloId).filter((x): x is string => !!x)
          const existing = ids.length
            ? await db.lead.findMany({
                where:  { workspaceId: params.workspaceId, apolloId: { in: ids } },
                select: { apolloId: true },
              })
            : []
          const knownIds = new Set(existing.map((e) => e.apolloId))
          const fresh = withCompany.filter((l) => !knownIds.has(l.apolloId))

          candidateLeads.push(...fresh)
          emit({ type: 'search_progress', found: Math.min(candidateLeads.length, TARGET_NEW) })

          // Stop when we have enough, or Apollo has no more to give.
          if (candidateLeads.length >= TARGET_NEW) break
          if (pageResult.leads.length < PER_PAGE) break          // reached last page
          if (p * PER_PAGE >= apolloTotal) break                 // exhausted total
        }

        // Trim to exactly what the user asked for: never over-deliver.
        if (candidateLeads.length > TARGET_NEW) candidateLeads.length = TARGET_NEW

        console.info('[lead-pipeline] apollo-search', JSON.stringify({
          workspaceId:    params.workspaceId,
          apolloFilters:  {
            jobTitles:    params.jobTitles,
            industry:     params.industry,
            companySizes: params.companySizes,
            country:      params.country,
            seniorities:  params.seniorities,
          },
          apolloTotal,
          pagesScanned,
          freshCandidates: candidateLeads.length,
          target:          TARGET_NEW,
        }))

        // ── Phase 1.5: Email Discovery (Apollo bulk_match -> Hunter fallback) ──
        //
        // Strategy:
        //   1. Apollo bulk_match: uses apolloId to fetch real email + real name.
        //      Consumes 1 export credit per match. ~95% success rate.
        //   2. Hunter FindEmail: fallback for leads Apollo couldn't enrich.
        //      Works on first_name + cleaned_last_name + company. ~30% success.
        //
        // This two-tier approach maximises email yield while respecting quotas.
        if (isAborted()) return
        emit({ type: 'enrich_start', total: candidateLeads.length })

        // ── Step A: Apollo bulk_match ──────────────────────────────────────────
        const apolloEnriched = await enrichApolloLeadsBatch(
          candidateLeads.map((l) => ({
            apolloId:  l.apolloId,
            firstName: l.firstName,
            lastName:  l.lastName,
            company:   l.company,
          })),
          { batchSize: 10, delayMs: 500 },
        )

        // Separate into: got email from Apollo vs. still needs Hunter
        const apolloHit  = apolloEnriched.filter((r) => !!r.email)
        const apolloMiss = apolloEnriched.filter((r) => !r.email)

        // Index the rich (non-email) enrichment extras by apolloId so we can
        // persist them onto LeadEnrichment.linkedinData (JSON) after upsert
        // no migration needed, and they feed the lead detail drawer.
        const extrasByApolloId = new Map(
          apolloEnriched
            .filter((r) => r.headline || r.companyDescription || r.technologies.length > 0 || r.city || r.companyLinkedinUrl)
            .map((r) => [r.apolloId, {
              headline:           r.headline,
              city:               r.city,
              companyDescription: r.companyDescription,
              companyLinkedinUrl: r.companyLinkedinUrl,
              technologies:       r.technologies,
            }]),
        )

        // ── Step B: Enrichment waterfall for Apollo misses ─────────────────────
        // Apollo bulk_match (Step A) is the credit hog and dies the moment Apollo
        // runs out of credits. The waterfall (LeadMagic -> Findymail -> Hunter ->
        // Prospeo, cheapest-first, pay-on-success) finds the email from any
        // configured provider, so Phantera keeps collecting leads even at 0 Apollo
        // credits. Capped + deadline-bounded to fit Vercel's 60s function budget.
        // Budget sized for Vercel Pro (maxDuration 300s): we can afford a wider
        // fallback than on Hobby. The deadline still guarantees we leave room for
        // save -> score -> copy -> send before the function ceiling.
        const MAX_FALLBACK = 80
        let hunterFallbackResults: Array<{ email: string | null }> = []
        if (apolloMiss.length > 0) {
          const fallbackTargets = apolloMiss.slice(0, MAX_FALLBACK)
          if (apolloMiss.length > MAX_FALLBACK) {
            console.warn(`[lead-pipeline] enrichment fallback capped: ${MAX_FALLBACK}/${apolloMiss.length} (time budget).`)
          }
          // Resolve a company DOMAIN for each lead so the waterfall providers
          // match by domain (far higher hit rate than company name). The domain
          // comes from Apollo enrichment (companyWebsite) OR: crucially when
          // Apollo has 0 credits: from the FREE Apollo search (candidate.website).
          const candidateByApolloId = new Map(candidateLeads.map((l) => [l.apolloId, l]))
          const enriched = await enrichEmailsWaterfall(
            fallbackTargets.map((r) => ({
              firstName: r.firstName ?? '',
              // Strip Apollo obfuscation chars (*) so providers get valid input
              // Apollo returns null names on partial profiles (prod incident 2026-07-11).
              lastName:  (r.lastName ?? '').replace(/[^a-zA-ZÀ-ÿ\s\-']/g, '').trim() || (r.firstName ?? ''),
              company:   r.company,
              domain:    extractDomain(r.companyWebsite ?? candidateByApolloId.get(r.apolloId)?.website ?? null),
            })),
            { concurrency: 5, deadlineMs: 120_000 },
          )
          hunterFallbackResults = enriched.map((e) => ({ email: e.email }))
          const found = enriched.filter((e) => e.email).length
          console.info(`[lead-pipeline] waterfall: ${found}/${fallbackTargets.length} emails trouvés`)
        }

        // ── Merge: build enriched leads array preserving original lead data ────
        // Index Apollo misses by apolloId for O(1) Hunter result lookup
        const apolloMissIndex = new Map(apolloMiss.map((r, i) => [r.apolloId, i]))

        type EnrichedLead = (typeof candidateLeads)[0] & {
          email:       string
          lastName:    string
          industry:    string | null
          linkedinUrl: string | null
        }

        const leadsWithEmail: EnrichedLead[] = []

        for (const lead of candidateLeads) {
          const enriched  = apolloEnriched.find((r) => r.apolloId === lead.apolloId)
          const apolloEmail = enriched?.email ?? null

          // Apollo found email -> use it with enriched metadata
          if (apolloEmail) {
            leadsWithEmail.push({
              ...lead,
              // Normalize email to lowercase: unique constraint is case-sensitive
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

          // Apollo missed -> check Hunter fallback result
          const missIdx    = apolloMissIndex.get(lead.apolloId)
          const hunterEmail = missIdx !== undefined
            ? (hunterFallbackResults[missIdx]?.email ?? null)
            : null

          if (hunterEmail) {
            leadsWithEmail.push({
              ...lead,
              // Normalize email to lowercase: unique constraint is case-sensitive
              email:       hunterEmail.toLowerCase().trim(),
              lastName:    enriched?.lastName    ?? lead.lastName,
              industry:    enriched?.industry    ?? lead.industry,
              linkedinUrl: enriched?.linkedinUrl ?? lead.linkedinUrl,
            })
          }
        }

        console.info(
          `[Pipeline] Enrichissement: ${apolloHit.length} Apollo + ` +
          `${leadsWithEmail.length - apolloHit.length} Hunter = ` +
          `${leadsWithEmail.length}/${candidateLeads.length} leads avec email`
        )

        emit({ type: 'enrich_done', verified: leadsWithEmail.length, total: candidateLeads.length })

        // ── Upsert leads with found emails ────────────────────────────────
        let savedCount = 0
        let duplicateCount = 0
        const savedLeadIds: string[] = []

        // Capture the workspace's lead quota ONCE before the loop. We re-check
        // remaining headroom every 10 leads to prevent users from blowing past
        // their plan limit via a single large pipeline run.
        const quotaSnapshot = await checkLeadQuota(params.workspaceId)
        const quotaCeiling  = quotaSnapshot.limit === Infinity ? Infinity : quotaSnapshot.limit
        let   quotaCurrent  = quotaSnapshot.current
        let   quotaHit      = false

        // An address that objected to this workspace is never stored again.
        for (const lead of await withoutOptedOut(db, params.workspaceId, leadsWithEmail)) {
          // Stop saving new leads once the plan limit is reached
          if (quotaCeiling !== Infinity && quotaCurrent >= quotaCeiling) {
            quotaHit = true
            break
          }
          if (await held(params.workspaceId, lead, actingUserId)) {
            duplicateCount++
            continue
          }
          try {
            // Check if this person was already saved under a different email
            // (e.g. a previous run used Hunter and found an incorrect email).
            // If so, update that record in place instead of creating a duplicate.
            const existingByApolloId = lead.apolloId
              ? await db.lead.findFirst({
                  where:  { workspaceId: params.workspaceId, apolloId: lead.apolloId },
                  select: { id: true },
                })
              : null

            let saved

            if (existingByApolloId) {
              // Overwrite the old record: fixes email + real last name
              saved = await db.lead.update({
                where: { id: existingByApolloId.id },
                data: {
                  firstName:   lead.firstName,
                  lastName:    lead.lastName,
                  email:       lead.email,
                  company:     lead.company,
                  title:       lead.title,
                  industry:    lead.industry,
                  linkedinUrl: lead.linkedinUrl,
                  website:     lead.website,
                  country:     lead.country,
                },
              })
            } else {
              // No prior record: standard upsert on email
              saved = await db.lead.upsert({
                where: { workspaceId_email: { workspaceId: params.workspaceId, email: lead.email } },
                create: {
                  workspaceId: params.workspaceId,
                  campaignId:  params.campaignId ?? null,
                  firstName:   lead.firstName,
                  lastName:    lead.lastName,
                  email:       lead.email,
                  company:     lead.company,
                  title:       lead.title,
                  industry:    lead.industry,
                  linkedinUrl: lead.linkedinUrl,
                  website:     lead.website,
                  country:     lead.country,
                  source:      'APOLLO',
                  apolloId:    lead.apolloId,
                },
                update: {
                  firstName:   lead.firstName,
                  lastName:    lead.lastName,
                  title:       lead.title,
                  company:     lead.company,
                  industry:    lead.industry,
                  linkedinUrl: lead.linkedinUrl,
                  website:     lead.website,
                  country:     lead.country,
                },
              })
            }

            savedLeadIds.push(saved.id)
            savedCount++
            quotaCurrent++  // track newly created leads against the ceiling
          } catch {
            duplicateCount++
          }
        }

        if (quotaHit) {
          emit({
            type: 'error',
            message: `Quota leads atteint (${quotaCurrent}/${quotaCeiling}). ${savedCount} leads sauvegardés sur ${leadsWithEmail.length} trouvés. Passez à un plan supérieur pour continuer.`,
          })
        }

        // Pool-served leads join the pipeline (scoring, sequences, summary).
        savedLeadIds.push(...poolSavedIds)
        savedCount += poolSavedIds.length

        // Into the campaign, except leads running in a colleague's campaign.
        if (params.campaignId) {
          await attachToCampaign(db, { workspaceId: params.workspaceId, campaignId: params.campaignId, leadIds: savedLeadIds })
        }

        emit({ type: 'search_done', saved: savedCount, duplicates: duplicateCount })

        // Fire QUOTA_WARNING notification if usage ≥ 80% (non-blocking)
        void maybeFireLeadQuotaWarning(params.workspaceId).catch(() => null)

        if (savedLeadIds.length === 0 && !quotaHit) {
          // Diagnose WHY nothing was saved instead of silently returning 0.
          const hasApollo = !!process.env.APOLLO_API_KEY
          const hasHunter = !!process.env.HUNTER_API_KEY
          let why: string
          if (candidateLeads.length === 0) {
            why = 'Aucun prospect trouvé chez Apollo pour ces filtres. '
              + (!hasApollo ? 'APOLLO_API_KEY est absente sur le serveur : ajoutez-la dans les variables d\'environnement Vercel.' : 'Élargissez vos critères (titres / secteur / pays).')
          } else if (!hasApollo && !hasHunter) {
            why = `Apollo a renvoyé ${candidateLeads.length} prospects mais aucun email n'a pu être trouvé : aucune clé d'enrichissement configurée (APOLLO_API_KEY / HUNTER_API_KEY) sur le serveur Vercel.`
          } else {
            why = `Apollo a renvoyé ${candidateLeads.length} prospects mais 0 email trouvé. Vérifiez vos crédits Apollo (export) / Hunter, ou que les clés en production sont valides.`
          }
          console.error('[lead-pipeline] 0 leads saved:', JSON.stringify({
            candidates: candidateLeads.length, withEmail: leadsWithEmail.length, hasApollo, hasHunter,
          }))
          emit({ type: 'error', message: why })
          return  // finally will call safeClose()
        }

        if (savedLeadIds.length === 0) {
          emit({
            type: 'pipeline_done',
            leads: [],
            summary: { totalFound: candidateLeads.length, totalSaved: 0, totalEnriched: 0, distribution: { FAST_TRACK: 0, NORMAL: 0, NURTURE: 0, SKIP: 0, UNSCORED: savedCount } },
          })
          return  // finally will call safeClose()
        }

        // ── Phase 2: Email Verification ───────────────────────────────────
        // Hunter already found these emails: we verify deliverability.
        // Pool-served leads are EXCLUDED: their verification snapshot came with
        // the pool row (that's the whole point: zero re-verification cost).
        const poolIdSet = new Set(poolSavedIds)
        const leadsToVerify = await db.lead.findMany({
          where: { id: { in: savedLeadIds.filter((x) => !poolIdSet.has(x)) } },
          select: { id: true, email: true, apolloId: true },
        })

        const emails = leadsToVerify.map((l) => l.email)
        const verifications = await verifyEmailBatch(emails, { concurrency: 3, delayMs: 200 })

        let enrichedCount = 0
        let verifiedCount = 0

        await Promise.allSettled(
          leadsToVerify.map(async (lead, i) => {
            const v = verifications[i]
            if (!v) return
            // Attach the rich Apollo extras (tech stack, company description,
            // headline, city) captured during bulk_match: stored as JSON so the
            // detail drawer can surface them. No schema migration required.
            const extras = lead.apolloId ? extrasByApolloId.get(lead.apolloId) ?? null : null
            await db.leadEnrichment.upsert({
              where:  { leadId: lead.id },
              create: { leadId: lead.id, emailVerified: v.verified, emailConfidence: v.confidence, emailStatus: v.status, linkedinData: extras ?? undefined, enrichedAt: new Date() },
              update: { emailVerified: v.verified, emailConfidence: v.confidence, emailStatus: v.status, ...(extras ? { linkedinData: extras } : {}), enrichedAt: new Date() },
            })
            enrichedCount++
            if (v.verified) verifiedCount++
          })
        )

        // ── Pool write-back (fire-and-forget) ─────────────────────────────
        // Every freshly enriched Apollo lead feeds Phantera's own GlobalLead
        // pool, so the NEXT similar search (any workspace) costs zero credits.
        // Failures are logged, never propagated: the pool must not break runs.
        {
          const apolloOnlyIds = savedLeadIds.filter((x) => !poolIdSet.has(x))
          if (apolloOnlyIds.length > 0) {
            void (async () => {
              const rows = await db.lead.findMany({
                where:   { id: { in: apolloOnlyIds } },
                include: { enrichment: true },
              })
              const written = await upsertLeadsIntoPool(rows.map((l) => ({
                email:           l.email,
                apolloId:        l.apolloId,
                firstName:       l.firstName,
                lastName:        l.lastName,
                company:         l.company,
                title:           l.title,
                industry:        l.industry,
                linkedinUrl:     l.linkedinUrl,
                website:         l.website,
                country:         l.country,
                companySize:     l.companySize,
                emailVerified:   l.enrichment?.emailVerified ?? false,
                emailConfidence: l.enrichment?.emailConfidence ?? null,
                emailStatus:     l.enrichment?.emailStatus ?? null,
                linkedinData:    (l.enrichment?.linkedinData ?? null) as never,
              })))
              console.info('[lead-pipeline] pool-writeback', JSON.stringify({ written, of: apolloOnlyIds.length }))
            })().catch((err) =>
              console.warn('[lead-pipeline] pool write-back failed (non-fatal):',
                err instanceof Error ? err.message : String(err)),
            )
          }
        }

        // ── Phase 3: Score ────────────────────────────────────────────────
        const leadsForScoring = await db.lead.findMany({
          where: { id: { in: savedLeadIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            title: true,
            company: true,
            industry: true,
            country: true,
            companySize: true,
            enrichment: { select: { emailConfidence: true } },
          },
        })

        emit({ type: 'score_start', total: leadsForScoring.length })

        const icp = { targetIndustry: workspace.targetIndustry, targetCompanySize: workspace.targetCompanySize }
        // Use the search params AS the scoring context: the user already told us
        // exactly what profile they want by filling the search form.
        const targeting = {
          targetTitles:       params.jobTitles ?? [],
          targetCompanySizes: params.companySizes ?? [],
          targetGeos:         params.country ? [params.country] : [],
          goal:               'LEADS',
        }

        if (isAborted()) return
        const scoreResults = await scoreLeads(
          leadsForScoring.map((l) => ({
            id: l.id,
            firstName: l.firstName,
            lastName: l.lastName,
            title: l.title,
            company: l.company,
            industry: l.industry,
            country: l.country,
            companySize: l.companySize,
            emailConfidence: l.enrichment?.emailConfidence ?? null,
          })),
          icp,
          targeting
        )

        const distribution: Record<LeadScoreBadge, number> = { FAST_TRACK: 0, NORMAL: 0, NURTURE: 0, SKIP: 0, UNSCORED: 0 }
        let scoredCount = 0

        await Promise.allSettled(
          scoreResults.map(async (result) => {
            const badge = result.badge
            // updateMany never throws if the row vanished mid-pipeline (e.g. a
            // concurrent run re-keyed it): it just updates 0 rows. Only count
            // the lead as scored when a row was actually written.
            const { count } = await db.lead.updateMany({
              where: { id: result.leadId },
              data: scoreUpdate(result),
            })
            if (count > 0) {
              distribution[badge]++
              scoredCount++
              if (scoredCount % 5 === 0) {
                emit({ type: 'score_progress', scored: scoredCount, total: scoreResults.length })
              }
            }
          })
        )

        emit({ type: 'score_done', distribution })

        // No "copywriter" or "outreach" phase here: this search writes no
        // sequence (a campaign's sequence is written once, in the wizard) and
        // queues nothing by itself. The screen shows the three steps that run.

        // ── Final: return enriched leads ──────────────────────────────────
        const finalLeads = await db.lead.findMany({
          where: { id: { in: savedLeadIds } },
          include: { enrichment: true },
          orderBy: [{ scoreBadge: 'asc' }, { aiScore: 'desc' }],
        })

        emit({
          type: 'pipeline_done',
          leads: finalLeads.map((l) => ({
            ...l,
            createdAt: l.createdAt.toISOString(),
            updatedAt: l.updatedAt.toISOString(),
            enrichment: l.enrichment ? {
              emailVerified: l.enrichment.emailVerified,
              emailConfidence: l.enrichment.emailConfidence,
              emailStatus: l.enrichment.emailStatus,
            } : null,
          })),
          summary: {
            totalFound: apolloTotal,
            totalSaved: savedCount,
            totalEnriched: enrichedCount,
            distribution,
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur pipeline'
        emit({ type: 'error', message })
      } finally {
        safeClose()
      }
      })()

      // Keep the serverless function alive until the pipeline resolves, even
      // after the client disconnects (campaign wizard redirect on launch).
      after(pipeline)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
