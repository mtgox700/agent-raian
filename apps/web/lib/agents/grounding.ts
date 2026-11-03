/**
 * Phantera: Hallucination grounding guard for generated copy.
 *
 * Cold-email copy must never invent company-specific facts (fake stats, made-up
 * percentages, fabricated figures). Ungrounded claims destroy trust and, in some
 * jurisdictions, trigger enforcement. This guard flags "specific factual claims"
 * in a generated email that are NOT backed by the source facts the copywriter
 * was given.
 *
 * It is deliberately conservative and heuristic: it targets the most damaging
 * fabrications: numbers, percentages, and currency amounts: which a cold email
 * has no business inventing. Personalization placeholders ({{var}}) are ignored.
 *
 * Pure and fully unit-testable. Pairs with the LLM-based self-critique loop:
 * grounding violations force a regeneration.
 */

export interface GroundingInput {
  /** The generated email body (may contain {{placeholders}}). */
  body: string
  /** Source facts the copywriter was allowed to use (ICP, value prop, etc.). */
  sourceFacts: string[]
}

export interface GroundingIssue {
  kind: 'PERCENTAGE' | 'CURRENCY' | 'NUMBER'
  value: string
  context: string
}

export interface GroundingResult {
  ok: boolean
  issues: GroundingIssue[]
}

// Specific-claim patterns. We flag concrete figures a cold email shouldn't invent.
const PERCENT_RE = /\b\d{1,3}(?:[.,]\d+)?\s?%/g
const CURRENCY_RE = /(?:[$€£]\s?\d[\d.,\s]*?(?:k|m|bn|mn)?|\d[\d.,\s]*?(?:€|euros?|dollars?|usd|eur))/gi
// Multi-digit numbers (2+ digits): single digits are usually benign ("1 question").
const NUMBER_RE = /\b\d{2,}(?:[.,]\d+)?(?:x|×)?\b/g

/** Normalize for substring matching (digits + lowercase letters only). */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Strip {{placeholders}} so they aren't scanned as content. */
function stripPlaceholders(text: string): string {
  return text.replace(/\{\{[^}]*\}\}/g, ' ')
}

function digits(s: string): string {
  return s.replace(/[^\d]/g, '')
}

/**
 * Checks the body for specific numeric/statistical claims not present in the
 * source facts. Returns ok=false with the offending claims when any are found.
 */
export function checkGrounding({ body, sourceFacts }: GroundingInput): GroundingResult {
  const cleaned = stripPlaceholders(body)
  const factsBlob = norm(sourceFacts.join(' \n '))
  const factDigits = sourceFacts.map(digits).filter((d) => d.length >= 2)

  const issues: GroundingIssue[] = []
  const seen = new Set<string>()          // (kind:value) dedupe
  const flaggedDigits = new Set<string>() // digit-sequences already flagged

  const isGrounded = (raw: string): boolean => {
    const n = norm(raw)
    if (factsBlob.includes(n)) return true
    const d = digits(raw)
    // A figure is grounded if its digit-sequence appears in any source fact.
    return d.length >= 2 && factDigits.some((fd) => fd.includes(d))
  }

  const scan = (re: RegExp, kind: GroundingIssue['kind']) => {
    for (const m of cleaned.matchAll(re)) {
      const value = m[0].trim()
      if (!value) continue
      if (isGrounded(value)) continue
      const d = digits(value)
      // Don't double-count a bare number already covered by a % or currency claim.
      if (kind === 'NUMBER' && d && [...flaggedDigits].some((fd) => fd.includes(d))) continue
      const key = `${kind}:${value}`
      if (seen.has(key)) continue
      seen.add(key)
      if (d) flaggedDigits.add(d)
      const start = Math.max(0, (m.index ?? 0) - 25)
      const context = cleaned.slice(start, (m.index ?? 0) + value.length + 25).replace(/\s+/g, ' ').trim()
      issues.push({ kind, value, context })
    }
  }

  scan(PERCENT_RE, 'PERCENTAGE')
  scan(CURRENCY_RE, 'CURRENCY')
  scan(NUMBER_RE, 'NUMBER')

  return { ok: issues.length === 0, issues }
}

/** Human-readable critique note for the regeneration loop. */
export function groundingNote(result: GroundingResult): string {
  if (result.ok) return ''
  const list = result.issues.map((i) => `"${i.value}" (${i.kind.toLowerCase()})`).join(', ')
  return `Ungrounded specific claims not supported by the provided context: ${list}. Remove invented figures/stats or replace with the value proposition as given.`
}
