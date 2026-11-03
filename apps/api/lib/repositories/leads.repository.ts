/**
 * Phantera: Leads Repository
 *
 * Data access layer for leads: hot leads query, status updates.
 * Immutable update patterns: all writes return the updated object.
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { leadScope, type Scope } from '@/lib/auth/scope'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HotLead {
  id: string
  firstName: string
  lastName: string
  email: string
  company: string | null
  title: string | null
  status: string
  lastReplyAt: string | null
  lastReplyClassification: string | null
  lastReplySnippet: string | null
  qualifiedAt: string | null
  campaignName: string | null
  aiScore: number | null
  // CRM-export context (2026-07-17): the fields that make a hot lead
  // actionable once imported into HubSpot/Pipedrive.
  industry: string | null
  linkedinUrl: string | null
  website: string | null
}

export type LeadStatusUpdate = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'

// ─── Hot Leads ────────────────────────────────────────────────────────────────

/**
 * Returns leads that replied positively or are marked qualified/converted.
 * Sorted by lastReplyAt desc (most recent first).
 */
/** A lead is hot once qualified, converted, or after a positive reply. */
function hotLeadWhere(scope: Scope): Prisma.LeadWhereInput {
  return {
    AND: [leadScope(scope), {
      OR: [
        { status: 'qualified' },
        { status: 'converted' },
        { lastReplyClassification: 'POSITIVE' },
        { lastReplyClassification: 'MEETING_REQUEST' },
      ],
    }],
  }
}

export async function countHotLeads(scope: Scope): Promise<number> {
  return db.lead.count({ where: hotLeadWhere(scope) })
}

export async function getHotLeads(
  scope: Scope,
  limit = 50,
  cursor?: string,
): Promise<{ leads: HotLead[]; nextCursor: string | null }> {
  const rows = await db.lead.findMany({
    where: hotLeadWhere(scope),
    orderBy: [
      { lastReplyAt: { sort: 'desc', nulls: 'last' } },
      { updatedAt: 'desc' },
    ],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      company: true,
      title: true,
      status: true,
      lastReplyAt: true,
      lastReplyClassification: true,
      lastReplySnippet: true,
      qualifiedAt: true,
      aiScore: true,
      industry: true,
      linkedinUrl: true,
      website: true,
      campaign: { select: { name: true } },
    },
  })

  const hasMore = rows.length > limit
  const leads = (hasMore ? rows.slice(0, -1) : rows).map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    company: r.company,
    title: r.title,
    status: r.status,
    lastReplyAt: r.lastReplyAt?.toISOString() ?? null,
    lastReplyClassification: r.lastReplyClassification,
    lastReplySnippet: r.lastReplySnippet,
    qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
    campaignName: r.campaign?.name ?? null,
    aiScore: r.aiScore,
    industry: r.industry,
    linkedinUrl: r.linkedinUrl,
    website: r.website,
  }))

  return {
    leads,
    nextCursor: hasMore ? leads[leads.length - 1].id : null,
  }
}

// ─── Status update ────────────────────────────────────────────────────────────

/**
 * Updates a lead's status with the appropriate timestamp.
 * Immutable: returns the updated lead; never mutates in place.
 */
export async function updateLeadStatus(
  leadId: string,
  scope: Scope,
  status?: LeadStatusUpdate,
  doNotContact?: boolean,
): Promise<{ id: string; status: string; doNotContact: boolean } | null> {
  const now = new Date()

  const timestampPatch =
    status === 'qualified'  ? { qualifiedAt: now } :
    status === 'converted'  ? { wonAt: now }        :
    status === 'lost'       ? { lostAt: now }        :
    {}

  // updateMany: a lead the caller does not see (another workspace, another
  // member's campaign, deleted) is a clean "not found", not a 500.
  const where: Prisma.LeadWhereInput = { AND: [leadScope(scope), { id: leadId }] }
  const res = await db.lead.updateMany({
    where,
    data: {
      ...(status ? { status, ...timestampPatch } : {}),
      ...(doNotContact !== undefined ? { doNotContact } : {}),
    },
  })
  if (res.count === 0) return null
  return db.lead.findFirst({
    where,
    select: { id: true, status: true, doNotContact: true },
  })
}

// ─── Pipeline funnel ──────────────────────────────────────────────────────────

export interface PipelineCounts {
  new: number
  contacted: number
  qualified: number
  converted: number
  lost: number
}

export async function getPipelineCounts(scope: Scope): Promise<PipelineCounts> {
  const groups = await db.lead.groupBy({
    by: ['status'],
    where: leadScope(scope),
    _count: { id: true },
  })

  const counts: PipelineCounts = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
  for (const g of groups) {
    const key = g.status as keyof PipelineCounts
    if (key in counts) counts[key] = g._count.id
  }
  return counts
}
