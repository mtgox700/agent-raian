/**
 * Reply Inbox repository.
 *
 * Single read-source-of-truth for everything the Reply Inbox UI needs:
 *   • paginated list with classification filter
 *   • unread counter for the sidebar badge
 *   • single-reply detail (used by the drawer)
 *
 * Always scoped by the caller's scope (lib/auth/scope): the workspace, and
 * for a member only the replies to their own campaigns. Never accepts a
 * free-text filter that could leak across tenants.
 */

import { db } from '@/lib/db'
import { replyScope, type Scope } from '@/lib/auth/scope'
import { renderEmailTemplate } from '@/lib/services/resend-client'

// ─── Public types ────────────────────────────────────────────────────────────

export type ReplyClassification =
  | 'POSITIVE'
  | 'MEETING_REQUEST'
  | 'NEGATIVE'
  | 'NOT_INTERESTED'
  | 'NEUTRAL'

export type ReplyFilter = 'all' | 'positive' | 'meeting' | 'negative' | 'unread'

export interface InboxReplyRow {
  id:             string
  receivedAt:     Date
  fromEmail:      string
  bodySnippet:    string                // first 200 chars
  classification: ReplyClassification
  confidence:     number                // 0-100
  isRead:         boolean

  lead: {
    id:        string
    firstName: string
    lastName:  string
    email:     string
    company:   string | null
    title:     string | null
    aiScore:   number | null
  }

  campaign: {
    id:   string
    name: string
  }

  emailSend: {
    id:      string
    subject: string | null               // original subject sent
  } | null
}

export interface InboxReplyDetail extends InboxReplyRow {
  bodyText: string  // full text
}

interface InboxParams {
  scope:       Scope
  filter:      ReplyFilter
  page:        number
  pageSize:    number
}

interface InboxResult {
  rows:       InboxReplyRow[]
  total:      number
  totalPages: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function classificationWhere(filter: ReplyFilter): { classification?: string | { in: string[] } } {
  switch (filter) {
    case 'positive': return { classification: 'POSITIVE' }
    case 'meeting':  return { classification: 'MEETING_REQUEST' }
    case 'negative': return { classification: { in: ['NEGATIVE', 'NOT_INTERESTED'] } }
    default:         return {}
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function listReplies(params: InboxParams): Promise<InboxResult> {
  const { scope, filter, page, pageSize } = params

  // The `isProcessed` flag is set to true once Agent 5 has classified the
  // reply. The "unread" filter targets replies not yet marked as read by
  // the user (we use isProcessed as a proxy for now: a dedicated
  // `readByUserAt` column is on the Sprint 3 roadmap).
  const baseWhere = {
    ...replyScope(scope),
    ...(filter === 'unread' ? { isProcessed: false } : classificationWhere(filter)),
  }

  const [rows, total] = await Promise.all([
    db.emailReply.findMany({
      where: baseWhere,
      orderBy: { receivedAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:             true,
        receivedAt:     true,
        fromEmail:      true,
        bodyText:       true,
        classification: true,
        confidence:     true,
        isProcessed:    true,
        lead: {
          select: {
            id:        true,
            firstName: true,
            lastName:  true,
            email:     true,
            company:   true,
            title:     true,
            industry:  true,
            aiScore:   true,
          },
        },
        campaign: { select: { id: true, name: true } },
        emailSend: {
          select: {
            id:         true,
            emailStep:  { select: { subject: true } },
          },
        },
      },
    }),
    db.emailReply.count({ where: baseWhere }),
  ])

  return {
    rows: rows.map((r) => ({
      id:             r.id,
      receivedAt:     r.receivedAt,
      fromEmail:      r.fromEmail,
      bodySnippet:    r.bodyText.slice(0, 200),
      classification: r.classification as ReplyClassification,
      confidence:     r.confidence,
      isRead:         r.isProcessed,
      lead:           r.lead,
      campaign:       r.campaign,
      emailSend: r.emailSend
        ? { id: r.emailSend.id, subject: sentSubject(r.emailSend.emailStep?.subject, r.lead) }
        : null,
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * The subject as the lead received it. The step stores the template, so the
 * inbox used to show "sourcing chez {{company}}".
 */
function sentSubject(
  template: string | null | undefined,
  lead: { firstName: string; lastName: string; company: string | null; title: string | null; industry: string | null },
): string | null {
  if (!template) return null
  return renderEmailTemplate(template, {
    firstName: lead.firstName,
    lastName:  lead.lastName,
    company:   lead.company  ?? '',
    title:     lead.title    ?? '',
    industry:  lead.industry ?? '',
  })
}

/** Single reply, scoped like the list: used by the detail drawer. */
export async function getReply(replyId: string, scope: Scope): Promise<InboxReplyDetail | null> {
  const r = await db.emailReply.findFirst({
    where: { id: replyId, ...replyScope(scope) },
    select: {
      id:             true,
      receivedAt:     true,
      fromEmail:      true,
      bodyText:       true,
      classification: true,
      confidence:     true,
      isProcessed:    true,
      lead: {
        select: {
          id: true, firstName: true, lastName: true, email: true,
          company: true, title: true, industry: true, aiScore: true,
        },
      },
      campaign: { select: { id: true, name: true } },
      emailSend: {
        select: {
          id:        true,
          emailStep: { select: { subject: true } },
        },
      },
    },
  })

  if (!r) return null

  return {
    id:             r.id,
    receivedAt:     r.receivedAt,
    fromEmail:      r.fromEmail,
    bodyText:       r.bodyText,
    bodySnippet:    r.bodyText.slice(0, 200),
    classification: r.classification as ReplyClassification,
    confidence:     r.confidence,
    isRead:         r.isProcessed,
    lead:           r.lead,
    campaign:       r.campaign,
    emailSend: r.emailSend
      ? { id: r.emailSend.id, subject: sentSubject(r.emailSend.emailStep?.subject, r.lead) }
      : null,
  }
}

/** Count unread replies in a workspace: drives the sidebar badge. */
export async function countUnreadReplies(scope: Scope): Promise<number> {
  return db.emailReply.count({
    where: {
      ...replyScope(scope),
      isProcessed: false,
    },
  })
}

/** Mark a reply as "read" (sets isProcessed = true). */
export async function markReplyRead(replyId: string, scope: Scope): Promise<void> {
  // updateMany: a reply the caller does not see matches nothing.
  await db.emailReply.updateMany({
    where: { id: replyId, ...replyScope(scope) },
    data:  { isProcessed: true, processedAt: new Date() },
  })
}
