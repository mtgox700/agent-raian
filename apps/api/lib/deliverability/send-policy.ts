/**
 * Phantera: Deliverability send policy (Phase 0)
 *
 * Pure, side-effect-free rules that protect sender reputation. These are the
 * guardrails that keep a workspace from torching its own domains:
 *   - per-mailbox daily send caps
 *   - warm-up ramp for new mailboxes (never spike low -> high volume)
 *   - randomized inter-send delay (jitter) so sends don't look robotic
 *   - lightweight content linter (spam words, link/caps hygiene)
 *
 * Everything here is deterministic given its inputs (jitter takes an injectable
 * RNG) so it is fully unit-testable without a database, network, or clock.
 *
 * Numbers follow 2026 cold-email consensus (see docs/VEILLE_DATA_SIGNALS_INFRA.md):
 * ~30-50 sends/inbox/day, ramp 5 ->10 ->20 ->cap over 4 weeks.
 */

// ─── Caps & ramp ────────────────────────────────────────────────────────────

/** Prudent cold-email volume per mailbox per day: the default, and the level
 *  above which the product warns the customer about the spam risk. */
export const DEFAULT_DAILY_CAP = 50

/** Technical ceiling per mailbox per day, whatever the customer sets. Providers
 *  enforce their own limits too (Gmail ~500, Workspace ~2,000). */
export const MAX_DAILY_CAP = 500

/**
 * Warm-up ramp by mailbox age. A brand-new inbox must not jump straight to the
 * full cap: ISPs flag the low ->high volume pattern itself. Returns the max
 * cold sends allowed for a mailbox of the given age, clamped to `dailyCap`.
 */
export function rampLimit(mailboxAgeDays: number, dailyCap: number = DEFAULT_DAILY_CAP): number {
  const cap = Math.min(dailyCap, MAX_DAILY_CAP)
  if (mailboxAgeDays < 0) return 0
  if (mailboxAgeDays < 7) return Math.min(5, cap)   // week 1: warmup only
  if (mailboxAgeDays < 14) return Math.min(10, cap) // week 2
  if (mailboxAgeDays < 21) return Math.min(20, cap) // week 3
  return cap                                         // week 4+: full cap
}

export interface CapacityInput {
  mailboxAgeDays: number
  sentToday: number
  dailyCap?: number
  /** Warm-up ramp for a brand-new mailbox (opt-in). Off: full cap from day one. */
  warmup?: boolean
}

/** Today's limit for a mailbox: the ramp when warm-up is on, else its cap. */
export function dailyLimit({ mailboxAgeDays, dailyCap = DEFAULT_DAILY_CAP, warmup = true }: CapacityInput): number {
  if (warmup) return rampLimit(mailboxAgeDays, dailyCap)
  return Math.max(0, Math.min(dailyCap, MAX_DAILY_CAP))
}

/** Remaining sends allowed for a mailbox today, given its age and today's count. */
export function remainingCapacity(input: CapacityInput): number {
  return Math.max(0, dailyLimit(input) - Math.max(0, input.sentToday))
}

export interface SendDecision {
  allowed: boolean
  reason: 'OK' | 'CAP_REACHED' | 'MAILBOX_TOO_NEW'
  remaining: number
}

/** Whether one more send is allowed right now for this mailbox. */
export function canSend(input: CapacityInput): SendDecision {
  const limit = dailyLimit(input)
  if (limit === 0) {
    return { allowed: false, reason: 'MAILBOX_TOO_NEW', remaining: 0 }
  }
  const remaining = remainingCapacity(input)
  return remaining > 0
    ? { allowed: true, reason: 'OK', remaining }
    : { allowed: false, reason: 'CAP_REACHED', remaining: 0 }
}

// ─── Jitter ─────────────────────────────────────────────────────────────────

/**
 * Randomized delay (ms) between sends so cadence isn't robotically uniform.
 * Returns a value in [baseMs, baseMs + spreadMs). `rng` is injectable (defaults
 * to Math.random) so tests are deterministic.
 */
export function jitterDelayMs(
  baseMs: number,
  spreadMs: number,
  rng: () => number = Math.random,
): number {
  const safeBase = Math.max(0, baseMs)
  const safeSpread = Math.max(0, spreadMs)
  return Math.round(safeBase + rng() * safeSpread)
}

// ─── Content safety linter ──────────────────────────────────────────────────

/** Common spam-trigger words (lowercased). Not exhaustive: a first-pass guard. */
export const SPAM_WORDS = [
  'free', 'risk-free', 'guarantee', 'guaranteed', 'buy now', 'click here',
  'act now', 'limited time', 'cash', 'winner', 'congratulations', '100%',
  'no cost', 'cheap', 'order now', 'urgent', 'earn money', 'double your',
] as const

export interface ContentIssue {
  code: 'SPAM_WORD' | 'TOO_MANY_LINKS' | 'EXCESSIVE_CAPS' | 'TOO_MANY_EXCLAMATIONS' | 'EMPTY'
  detail: string
}

export interface LintResult {
  ok: boolean
  score: number // 0 (clean) .. higher = riskier
  issues: ContentIssue[]
}

const LINK_RE = /https?:\/\/[^\s"'<>)]+/gi

/**
 * Lints subject + body for the most common spam-filter triggers. Cold email
 * should be plain-text-like with ≤1 link and no money/urgency language.
 */
export function lintContent(subject: string, body: string): LintResult {
  const issues: ContentIssue[] = []
  const text = `${subject}\n${body}`
  const lower = text.toLowerCase()

  if (text.trim().length === 0) {
    return { ok: false, score: 100, issues: [{ code: 'EMPTY', detail: 'Subject and body are empty' }] }
  }

  for (const word of SPAM_WORDS) {
    if (lower.includes(word)) {
      issues.push({ code: 'SPAM_WORD', detail: `Contains spam-trigger phrase: "${word}"` })
    }
  }

  const links = text.match(LINK_RE) ?? []
  if (links.length > 1) {
    issues.push({ code: 'TOO_MANY_LINKS', detail: `${links.length} links found (recommended ≤1)` })
  }

  const letters = text.replace(/[^a-zA-Z]/g, '')
  if (letters.length >= 20) {
    const caps = letters.replace(/[^A-Z]/g, '').length
    if (caps / letters.length > 0.5) {
      issues.push({ code: 'EXCESSIVE_CAPS', detail: 'More than half the letters are uppercase' })
    }
  }

  const exclamations = (text.match(/!/g) ?? []).length
  if (exclamations > 2) {
    issues.push({ code: 'TOO_MANY_EXCLAMATIONS', detail: `${exclamations} exclamation marks` })
  }

  // Score: spam words weigh most; structural issues a bit less.
  const score = issues.reduce((s, i) => s + (i.code === 'SPAM_WORD' ? 15 : 10), 0)
  return { ok: issues.length === 0, score, issues }
}
