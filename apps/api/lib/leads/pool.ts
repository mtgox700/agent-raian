/**
 * Phantera: Global lead pool (provider-cost optimizer).
 *
 * Every enriched lead fetched from a provider is written into `GlobalLead`
 * (Phantera's own cross-workspace database). Searches consume the pool FIRST
 * and only call the provider for the remainder (founder decision 2026-07-06).
 *
 * Guarantees (the "mega pro" contract):
 *  1. NO duplicates for the requesting workspace: pool candidates already in
 *     the workspace (by email OR apolloId) are excluded at the SQL level.
 *  2. NO stale data served: a freshness gate (default 180 days) keeps decayed
 *     B2B records out of results; stale leads are refreshed via the provider.
 *  3. GDPR guards: `suppressed` rows are never served; provenance + serve
 *     counters give a full audit trail.
 *  4. Conservative filter matching: a pool hit must positively match the
 *     user's filters (title contains, industry contains, country, size). When
 *     in doubt, we UNDER-serve from the pool and let the provider fill the
 *     gap: quality beats savings.
 */

import { db } from '@/lib/db'
import { POOL_SCOPE, withoutOptedOut } from '@/lib/privacy/opt-out'
import { Prisma } from '@prisma/client'
import type { GlobalLead, TargetCompanySize } from '@prisma/client'

// B2B contact data decays ~30%/year: never serve records older than this.
const FRESHNESS_DAYS = 180

export interface PoolSearchFilters {
  jobTitles?: string[]
  industry?: string
  country?: string
  companySizes?: string[]
}

/** Map user search filters onto a conservative GlobalLead where-clause. */
function buildPoolWhere(filters: PoolSearchFilters): Prisma.GlobalLeadWhereInput {
  const AND: Prisma.GlobalLeadWhereInput[] = [
    { suppressed: false },
    { email: { not: '' } },
    { lastRefreshedAt: { gte: new Date(Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1000) } },
  ]

  if (filters.jobTitles?.length) {
    AND.push({
      OR: filters.jobTitles.map((t) => ({
        title: { contains: t, mode: 'insensitive' as const },
      })),
    })
  }
  if (filters.industry) {
    AND.push({ industry: { contains: filters.industry, mode: 'insensitive' } })
  }
  if (filters.country) {
    AND.push({ country: { equals: filters.country, mode: 'insensitive' } })
  }
  if (filters.companySizes?.length) {
    AND.push({ companySize: { in: filters.companySizes as TargetCompanySize[] } })
  }

  return { AND }
}

/**
 * Serve up to `limit` pool leads matching `filters` that the workspace does
 * NOT already own. Increments the serve counter (audit trail).
 */
/** Pool candidates read per round, and how many rounds at most (bounded work). */
const POOL_BATCH = 500
const POOL_MAX_ROUNDS = 10

export async function serveFromPool(
  workspaceId: string,
  filters: PoolSearchFilters,
  limit: number,
): Promise<GlobalLead[]> {
  if (limit <= 0) return []

  // Candidates in batches, ownership checked for those candidates only: the
  // whole workspace's emails used to go into one NOT IN (two bound
  // parameters per lead, past PostgreSQL's 65 535 limit at ~33 000 leads).
  const hits: GlobalLead[] = []
  let skip = 0
  for (let round = 0; round < POOL_MAX_ROUNDS && hits.length < limit; round++) {
    const batch = await db.globalLead.findMany({
      where:   buildPoolWhere(filters),
      orderBy: [{ lastRefreshedAt: 'desc' }, { id: 'asc' }], // freshest first, stable pages
      skip,
      take:    POOL_BATCH,
    })
    if (batch.length === 0) break
    skip += batch.length
    const apolloIds = batch.map((g) => g.apolloId).filter((x): x is string => !!x)
    const owned = await db.lead.findMany({
      where:  { workspaceId, OR: [{ email: { in: batch.map((g) => g.email) } }, ...(apolloIds.length ? [{ apolloId: { in: apolloIds } }] : [])] },
      select: { email: true, apolloId: true },
    })
    const ownedEmails = new Set(owned.map((l) => l.email))
    const ownedApolloIds = new Set(owned.map((l) => l.apolloId).filter(Boolean))
    for (const g of batch) {
      if (hits.length >= limit) break
      if (ownedEmails.has(g.email) || (g.apolloId && ownedApolloIds.has(g.apolloId))) continue
      hits.push(g)
    }
    if (batch.length < POOL_BATCH) break
  }

  if (hits.length) {
    // Fire-and-forget audit counter: never blocks the pipeline.
    void db.globalLead
      .updateMany({
        where: { id: { in: hits.map((h) => h.id) } },
        data:  { timesServed: { increment: 1 } },
      })
      .catch(() => null)
  }

  return hits
}

export interface PoolUpsertRow {
  email: string
  apolloId?: string | null
  firstName: string
  lastName: string
  company?: string | null
  title?: string | null
  industry?: string | null
  linkedinUrl?: string | null
  website?: string | null
  country?: string | null
  companySize?: TargetCompanySize | null
  emailVerified?: boolean
  emailConfidence?: number | null
  emailStatus?: string | null
  linkedinData?: Prisma.InputJsonValue | null
}

/**
 * Write enriched provider results into the pool (idempotent upsert by email).
 * Called fire-and-forget after enrichment/verification: a pool failure must
 * NEVER fail the user's pipeline.
 */
export async function upsertLeadsIntoPool(rows: PoolUpsertRow[]): Promise<number> {
  let written = 0
  const allowed = await withoutOptedOut(db, POOL_SCOPE, rows).catch(() => [] as PoolUpsertRow[])
  for (const r of allowed) {
    if (!r.email) continue
    try {
      await db.globalLead.upsert({
        where: { email: r.email },
        create: {
          email:           r.email,
          apolloId:        r.apolloId ?? null,
          firstName:       r.firstName,
          lastName:        r.lastName,
          company:         r.company ?? null,
          title:           r.title ?? null,
          industry:        r.industry ?? null,
          linkedinUrl:     r.linkedinUrl ?? null,
          website:         r.website ?? null,
          country:         r.country ?? null,
          companySize:     r.companySize ?? null,
          emailVerified:   r.emailVerified ?? false,
          emailConfidence: r.emailConfidence ?? null,
          emailStatus:     r.emailStatus ?? null,
          linkedinData:    r.linkedinData ?? Prisma.JsonNull,
        },
        update: {
          // Refresh identity + enrichment; never downgrade a verified email.
          firstName:       r.firstName,
          lastName:        r.lastName,
          company:         r.company ?? undefined,
          title:           r.title ?? undefined,
          industry:        r.industry ?? undefined,
          linkedinUrl:     r.linkedinUrl ?? undefined,
          website:         r.website ?? undefined,
          country:         r.country ?? undefined,
          companySize:     r.companySize ?? undefined,
          ...(r.emailVerified ? { emailVerified: true } : {}),
          emailConfidence: r.emailConfidence ?? undefined,
          emailStatus:     r.emailStatus ?? undefined,
          ...(r.linkedinData != null ? { linkedinData: r.linkedinData } : {}),
          ...(r.apolloId ? { apolloId: r.apolloId } : {}),
          lastRefreshedAt: new Date(),
        },
      })
      written++
    } catch {
      // Unique collision on apolloId with a different email, etc. — skip row.
    }
  }
  return written
}
