/**
 * Phantera: Unified inbox (consolidation: one pane of glass).
 *
 * Buyers are exhausted by franken-stacks (separate email + LinkedIn inboxes).
 * This merges replies across channels into ONE chronological conversation feed.
 * Pure merge/normalize/sort over inputs; fully unit-testable.
 */

export type InboxChannel = 'email' | 'linkedin'

export interface UnifiedMessage {
  id: string
  channel: InboxChannel
  leadId: string | null
  fromName: string
  snippet: string
  receivedAt: Date
  classification: string | null
}

export interface EmailReplyRow {
  id: string
  leadId: string | null
  fromEmail: string
  bodyText: string
  receivedAt: Date | string
  classification?: string | null
}

export interface LinkedInMessageRow {
  id: string
  leadId: string | null
  senderName: string
  text: string
  receivedAt: Date | string
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

function snippet(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/**
 * Merge email replies + LinkedIn messages into one feed, newest first.
 */
export function mergeInbox(emails: EmailReplyRow[], linkedins: LinkedInMessageRow[]): UnifiedMessage[] {
  const fromEmails: UnifiedMessage[] = emails.map((e) => ({
    id: e.id,
    channel: 'email',
    leadId: e.leadId,
    fromName: e.fromEmail,
    snippet: snippet(e.bodyText),
    receivedAt: toDate(e.receivedAt),
    classification: e.classification ?? null,
  }))

  const fromLinkedin: UnifiedMessage[] = linkedins.map((m) => ({
    id: m.id,
    channel: 'linkedin',
    leadId: m.leadId,
    fromName: m.senderName,
    snippet: snippet(m.text),
    receivedAt: toDate(m.receivedAt),
    classification: null,
  }))

  return [...fromEmails, ...fromLinkedin].sort(
    (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
  )
}

/** Group a unified feed by lead (most-recent message first within each lead). */
export function groupByLead(messages: UnifiedMessage[]): Map<string, UnifiedMessage[]> {
  const groups = new Map<string, UnifiedMessage[]>()
  for (const m of messages) {
    const key = m.leadId ?? '__unknown__'
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  return groups
}
