/**
 * Pure computations behind the dashboard numbers.
 *
 * Every figure here comes from rows that exist: no invented "previous month",
 * no target counts, no scores. A queued email (PENDING) is not a sent email,
 * and a rate is only shown when its base is not empty.
 */

export const DASHBOARD_TIME_ZONE = 'Europe/Paris'

const NOT_SENT = new Set(['PENDING', 'SENDING', 'FAILED'])

export interface SendRow {
  status: string
  sentAt: Date | null
  openedAt?: Date | null
  leadId: string
  /** Channel of the sequence step (EMAIL, LINKEDIN, WHATSAPP, SMS). Absent = EMAIL. */
  channel?: string
}

export interface ReplyRow {
  leadId:     string
  receivedAt: Date
}

export interface PeriodSummary {
  /** Messages that left, every channel. */
  messages:     number
  /** Emails that actually left the mailbox. */
  sent:         number
  bounced:      number
  /** sent − bounced: nothing else proves delivery. */
  delivered:    number
  opened:       number
  clicked:      number
  /** Distinct leads that received at least one message, any channel. */
  leadsReached: number
  /** Of those, the leads that replied in the same period. */
  leadsReplied: number
  /** Percentages, or null when their base is empty. */
  deliveryRate: number | null
  openRate:     number | null
  clickRate:    number | null
  replyRate:    number | null
}

export function wasSent(row: { status: string; sentAt: Date | null }): boolean {
  return row.sentAt !== null && !NOT_SENT.has(row.status)
}

function inRange(date: Date, from: Date, to: Date): boolean {
  return date >= from && date < to
}

function rate(part: number, base: number): number | null {
  return base > 0 ? Math.round((part / base) * 1000) / 10 : null
}

export function summarizePeriod(sends: SendRow[], replies: ReplyRow[], from: Date, to: Date): PeriodSummary {
  const messages = sends.filter((s) => wasSent(s) && inRange(s.sentAt as Date, from, to))
  // Opens and bounces only exist for emails: a WhatsApp message is never "delivered" or "opened" here.
  const sent = messages.filter((s) => (s.channel ?? 'EMAIL') === 'EMAIL')
  const bounced = sent.filter((s) => s.status === 'BOUNCED').length
  const opened = sent.filter((s) => s.status !== 'BOUNCED' && (s.status === 'OPENED' || s.status === 'CLICKED' || Boolean(s.openedAt))).length
  const clicked = sent.filter((s) => s.status === 'CLICKED').length
  const delivered = sent.length - bounced
  const reached = new Set(messages.map((s) => s.leadId))
  // Same window on both sides: a lead contacted last month who answers today
  // is not counted, so the rate can never pass 100 %.
  const replied = new Set(replies.filter((r) => inRange(r.receivedAt, from, to) && reached.has(r.leadId)).map((r) => r.leadId))

  return {
    messages:     messages.length,
    sent:         sent.length,
    bounced,
    delivered,
    opened,
    clicked,
    leadsReached: reached.size,
    leadsReplied: replied.size,
    deliveryRate: rate(delivered, sent.length),
    openRate:     rate(opened, delivered),
    clickRate:    rate(clicked, delivered),
    replyRate:    rate(replied.size, reached.size),
  }
}

export type Trend = 'up' | 'down' | 'flat'

/** Trend of a value against the previous period; null when there is nothing to compare. */
export function compare(current: number | null, previous: number | null): { previousValue: number | null; trend: Trend } {
  if (current === null || previous === null || previous === 0) return { previousValue: null, trend: 'flat' }
  const trend: Trend = current > previous ? 'up' : current < previous ? 'down' : 'flat'
  return { previousValue: previous, trend }
}

// Building an Intl.DateTimeFormat costs about a millisecond; the home page
// formats one date per email sent: one formatter per time zone, reused.
const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dayFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayFormatters.set(timeZone, f)
  }
  return f
}

/** "YYYY-MM-DD" of a date as seen in the given time zone. */
export function dayKey(date: Date, timeZone = DASHBOARD_TIME_ZONE): string {
  return dayFormatter(timeZone).format(date)
}

/** Midnight of the day containing `now`, in the given time zone. */
export function startOfDayIn(now: Date, timeZone = DASHBOARD_TIME_ZONE): Date {
  const [y, m, d] = dayKey(now, timeZone).split('-').map(Number)
  const utcMidnight = Date.UTC(y, m - 1, d)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(new Date(utcMidnight))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const zonedAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(utcMidnight - (zonedAsUtc - utcMidnight))
}

/** The last `days` day keys, oldest first, ending today. */
export function lastDayKeys(now: Date, days: number, timeZone = DASHBOARD_TIME_ZONE): string[] {
  // Anchored at noon UTC so a daylight-saving change never skips or repeats a day.
  const [y, m, d] = dayKey(now, timeZone).split('-').map(Number)
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d - (days - 1 - i), 12)).toISOString().slice(0, 10),
  )
}

export function countByDay(dates: Date[], timeZone = DASHBOARD_TIME_ZONE): Map<string, number> {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const key = dayKey(date, timeZone)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}
