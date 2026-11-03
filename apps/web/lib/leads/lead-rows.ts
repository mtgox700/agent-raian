/**
 * One shape for the Leads page rows, whether they come from the page load or
 * from /api/leads (search, refresh after scoring). The API used to drop the
 * website and enrichment extras, so a refresh emptied parts of the drawer.
 */

import type { Prisma } from '@prisma/client'
import type { LeadWithEnrichment } from '@/lib/types/lead'
import { parseEnrichmentExtras } from '@/lib/helpers/parse-enrichment-extras'
import { LEAD_STATUS_FILTERS, searchWords } from '@/lib/leads/lead-status'

/** Rows loaded at once; the rest of the base is reached through search. */
export const LEAD_LIST_LIMIT = 500

export const LEAD_LIST_ORDER: Prisma.LeadOrderByWithRelationInput[] = [
  { scoreBadge: 'asc' },
  { createdAt: 'desc' },
]

type LeadWithEnrichmentRow = Prisma.LeadGetPayload<{ include: { enrichment: true } }>

export function toLeadRow(l: LeadWithEnrichmentRow): LeadWithEnrichment {
  return {
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    email: l.email,
    company: l.company,
    title: l.title,
    industry: l.industry,
    linkedinUrl: l.linkedinUrl,
    website: l.website,
    country: l.country,
    companySize: l.companySize,
    source: l.source,
    apolloId: l.apolloId,
    aiScore: l.aiScore,
    scoreBadge: l.scoreBadge,
    scoreReason: l.scoreReason,
    status: l.status,
    doNotContact: l.doNotContact,
    phone: l.phone,
    createdAt: l.createdAt.toISOString(),
    enrichment: l.enrichment
      ? {
          emailVerified: l.enrichment.emailVerified,
          emailConfidence: l.enrichment.emailConfidence,
          emailStatus: l.enrichment.emailStatus,
          ...parseEnrichmentExtras(l.enrichment.linkedinData),
        }
      : null,
  }
}

/** Search across the whole base: name, email, company, title. */
export function leadSearchWhere(workspaceId: string, q: string, status: string): Prisma.LeadWhereInput {
  const statuses = LEAD_STATUS_FILTERS[status]
  // Every word must match some field: "Camille Martin" spans two columns and
  // matched nothing when the whole phrase was compared to each field.
  const words = searchWords(q)
  return {
    workspaceId,
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(words.length > 0
      ? {
          AND: words.map((word) => ({
            OR: [
              { firstName: { contains: word, mode: 'insensitive' as const } },
              { lastName:  { contains: word, mode: 'insensitive' as const } },
              { email:     { contains: word, mode: 'insensitive' as const } },
              { company:   { contains: word, mode: 'insensitive' as const } },
              { title:     { contains: word, mode: 'insensitive' as const } },
            ],
          })),
        }
      : {}),
  }
}
