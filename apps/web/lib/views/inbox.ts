/**
 * Data of the Reply Inbox page (/dashboard/inbox), served by GET /api/views/inbox.
 *
 * Plan-gated: the inbox is a BUSINESS+ feature. On other plans the answer is
 * `{ locked: true, ... }` with what the locked view announces (price, annual
 * discount computed from the plan table, never written by hand).
 */

import type { AccessContext } from '@/lib/auth/access'
import { listReplies, type InboxReplyRow, type ReplyFilter } from '@/lib/repositories/replies.repository'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

const PAGE_SIZE = 25
const PRO_PLUS_PLANS = new Set(['BUSINESS', 'ENTERPRISE'])
const REPLY_FILTERS: ReplyFilter[] = ['all', 'positive', 'meeting', 'negative', 'unread']

// Only announced when an annual price exists in Stripe (0 = no annual option).
const BUSINESS_ANNUAL_DISCOUNT = PLAN_CONFIG.BUSINESS.stripeAnnualPriceId
  ? Math.round((1 - PLAN_CONFIG.BUSINESS.annualPrice / (PLAN_CONFIG.BUSINESS.price * 12)) * 100)
  : 0

export type InboxReplyJson = Omit<InboxReplyRow, 'receivedAt'> & { receivedAt: string }

export type InboxView =
  | { locked: true; businessPrice: number; businessAnnualDiscount: number }
  | {
      locked: false
      replies: InboxReplyJson[]
      total: number
      page: number
      totalPages: number
      filter: ReplyFilter
    }

export async function inboxView(
  workspace: AccessContext,
  query: { filter?: string; page?: string },
): Promise<InboxView> {
  if (!PRO_PLUS_PLANS.has(workspace.plan)) {
    return { locked: true, businessPrice: PLAN_CONFIG.BUSINESS.price, businessAnnualDiscount: BUSINESS_ANNUAL_DISCOUNT }
  }

  // An unknown ?filter= used to crash the empty state; fall back to all.
  const filter = REPLY_FILTERS.find((f) => f === query.filter) ?? 'all'
  const requestedPage = Math.max(1, parseInt(query.page ?? '1', 10) || 1)

  let result = await listReplies({
    scope: workspace,
    filter,
    page: requestedPage,
    pageSize: PAGE_SIZE,
  })
  // A page past the end (after replies were read or filtered) shows the last one.
  if (result.rows.length === 0 && requestedPage > result.totalPages) {
    result = await listReplies({
      scope: workspace,
      filter,
      page: result.totalPages,
      pageSize: PAGE_SIZE,
    })
  }
  const { rows, total, totalPages } = result
  const page = Math.min(requestedPage, totalPages)

  return {
    locked: false,
    replies: rows.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() })),
    total,
    page,
    totalPages,
    filter,
  }
}
