/**
 * Phantera: Hunter.io API Client
 *
 * Two capabilities:
 *  1. Email Finder: find an email from first name + company name
 *  2. Email Verifier: verify whether an email address is deliverable
 *
 * Hunter free tier: 25 requests/month across all endpoints.
 * Mock mode is active when HUNTER_API_KEY is not set.
 */

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface HunterVerificationResult {
  email:      string
  verified:   boolean
  confidence: number  // 0-100
  status:     'valid' | 'invalid' | 'accept_all' | 'unknown'
  disposable: boolean
  webmail:    boolean
}

export interface HunterFinderResult {
  email:  string | null  // null if Hunter couldn't find one
  score:  number         // confidence 0-100
  domain: string | null  // company domain found by Hunter
}

// ─── Hunter API response shapes ───────────────────────────────────────────────

interface HunterVerifyResponse {
  data: {
    status:      'valid' | 'invalid' | 'accept_all' | 'unknown'
    score:       number
    email:       string
    disposable:  boolean
    webmail:     boolean
    block:       boolean
    mx_records:  boolean
    smtp_server: boolean
    smtp_check:  boolean
    accept_all:  boolean
  }
}

interface HunterFinderResponse {
  data: {
    email:  string | null
    score:  number
    domain: string | null
  } | null
}

// ─── 1. Email Finder ──────────────────────────────────────────────────────────
// Finds an email address from first name + last name + company name.
// Hunter /v2/email-finder requires both first_name AND last_name (400 otherwise).
// Apollo returns an obfuscated last name (e.g. "Do***e"): we pass it as-is;
// Hunter can still use the first/last letters to narrow the pattern.

export async function findEmailByCompany(
  firstName: string,
  lastName:  string,
  company:   string,
): Promise<HunterFinderResult> {
  const apiKey = hunterApiKey()

  if (!apiKey) {
    // No key: return null silently (caller handles gracefully)
    return { email: null, score: 0, domain: null }
  }

  try {
    // Apollo Basic obfuscates last names as "Do***e" or "Ma****n".
    // Strip all non-letter characters (asterisks, digits, etc.) so Hunter
    // receives a valid alphabetic string: partial is still better than 400.
    const cleanLastName = lastName.replace(/[^a-zA-ZÀ-ÿ\s\-']/g, '').trim()

    // If nothing remains after sanitising (e.g. "***"), skip the request.
    if (!cleanLastName) {
      console.warn(`[Hunter] Nom de famille entièrement obfusqué pour ${firstName} @ ${company}: skippé`)
      return { email: null, score: 0, domain: null }
    }

    const url = new URL('https://api.hunter.io/v2/email-finder')
    url.searchParams.set('first_name', firstName)
    url.searchParams.set('last_name',  cleanLastName)
    url.searchParams.set('company',    company)
    url.searchParams.set('api_key',    apiKey)

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
    })

    if (res.status === 401) {
      console.warn('[Hunter] Clé API invalide pour Email Finder')
      return { email: null, score: 0, domain: null }
    }
    if (res.status === 429) {
      // Retry once with exponential backoff. Hunter free/starter tier has a
      // strict per-second cap (~15 req/s): a single pause usually clears it.
      // Honour Retry-After header if Hunter provides one, else default to 2s.
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '2', 10)
      const waitMs     = Math.min(Math.max(retryAfter * 1000, 1000), 10_000)
      console.warn(`[Hunter] 429 rate limit: backoff ${waitMs}ms then retry once`)
      await new Promise((r) => setTimeout(r, waitMs))

      const retry = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) })
      if (retry.status === 429) {
        console.warn('[Hunter] 429 after retry: giving up (lead will not get an email)')
        return { email: null, score: 0, domain: null }
      }
      if (!retry.ok) {
        console.warn(`[Hunter] Retry failed with ${retry.status}`)
        return { email: null, score: 0, domain: null }
      }
      const retryData = (await retry.json()) as HunterFinderResponse
      const rd = retryData.data
      return {
        email:  rd?.email  ?? null,
        score:  rd?.score  ?? 0,
        domain: rd?.domain ?? null,
      }
    }
    if (!res.ok) {
      // Log the response body to help diagnose future issues
      const errBody = await res.text().catch(() => '(no body)')
      console.warn(`[Hunter] Email Finder erreur ${res.status}: ${errBody}`)
      return { email: null, score: 0, domain: null }
    }

    const data = (await res.json()) as HunterFinderResponse
    const d = data.data

    return {
      email:  d?.email  ?? null,
      score:  d?.score  ?? 0,
      domain: d?.domain ?? null,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      console.warn(`[Hunter] Email Finder timeout for ${firstName} @ ${company}`)
    }
    return { email: null, score: 0, domain: null }
  }
}

// ─── Batch Email Finder with concurrency control ──────────────────────────────

export async function findEmailBatch(
  leads: Array<{ firstName: string; lastName: string; company: string }>,
  options: { concurrency?: number; delayMs?: number } = {},
): Promise<HunterFinderResult[]> {
  const { concurrency = 2, delayMs = 400 } = options  // conservative for free plan
  const results: HunterFinderResult[] = []

  for (let i = 0; i < leads.length; i += concurrency) {
    const chunk = leads.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      chunk.map((l) => findEmailByCompany(l.firstName, l.lastName, l.company))
    )

    for (const result of settled) {
      results.push(
        result.status === 'fulfilled'
          ? result.value
          : { email: null, score: 0, domain: null }
      )
    }

    if (i + concurrency < leads.length) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  return results
}

/** HUNTER_API_KEY without surrounding whitespace, or undefined. */
export function hunterApiKey(): string | undefined {
  return process.env.HUNTER_API_KEY?.trim() || undefined
}

// ─── 2. Email Verifier ────────────────────────────────────────────────────────
// Verifies whether an existing email address is deliverable.

export async function verifyEmail(email: string): Promise<HunterVerificationResult> {
  const apiKey = hunterApiKey()

  if (!apiKey) {
    console.warn('[Hunter] HUNTER_API_KEY not set: using mock verification')
    return { email, verified: true, confidence: 85, status: 'valid', disposable: false, webmail: false }
  }

  try {
    const url = new URL('https://api.hunter.io/v2/email-verifier')
    url.searchParams.set('email',   email)
    url.searchParams.set('api_key', apiKey)

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6_000),
    })

    if (res.status === 401) throw new Error('Hunter API key invalide')
    if (res.status === 429) {
      // Retry once with backoff. Honour Retry-After if provided.
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '2', 10)
      const waitMs     = Math.min(Math.max(retryAfter * 1000, 1000), 10_000)
      await new Promise((r) => setTimeout(r, waitMs))

      const retry = await fetch(url.toString(), { signal: AbortSignal.timeout(6_000) })
      if (retry.status === 429 || !retry.ok) {
        console.warn(`[Hunter] Rate limited for ${email} (retry also failed): returning unknown`)
        return { email, verified: false, confidence: 0, status: 'unknown', disposable: false, webmail: false }
      }
      const retryData = (await retry.json()) as HunterVerifyResponse
      const rd = retryData.data
      return {
        email,
        verified:   rd.status === 'valid' && !rd.block,
        confidence: rd.score,
        status:     rd.status,
        disposable: rd.disposable,
        webmail:    rd.webmail,
      }
    }
    if (!res.ok) throw new Error(`Hunter API error: ${res.status}`)

    const data = (await res.json()) as HunterVerifyResponse
    const d = data.data

    return {
      email,
      verified:   d.status === 'valid' && !d.block,
      confidence: d.score,
      status:     d.status,
      disposable: d.disposable,
      webmail:    d.webmail,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      console.warn(`[Hunter] Timeout for ${email}`)
      return { email, verified: false, confidence: 0, status: 'unknown', disposable: false, webmail: false }
    }
    throw err
  }
}

// ─── Batch Verifier with concurrency control + circuit breaker ───────────────
//
// CRITICAL: Hunter has tight rate limits (15 req/s on free tier, scaled on
// paid). Hammering it on a 100-lead campaign causes every call to 429.
//
// Circuit breaker: if 3 calls in a row return 429, we stop trying for the
// REST of this batch and return "unknown" for all remaining emails. This
// turns a 5-minute hang into a 10-second graceful skip, and lets the
// pipeline proceed to scoring + copywriting (which don't need Hunter).

const CIRCUIT_BREAKER_THRESHOLD = 3

function unknownVerification(email: string): HunterVerificationResult {
  return { email, verified: false, confidence: 0, status: 'unknown', disposable: false, webmail: false }
}

export async function verifyEmailBatch(
  emails: string[],
  options: { concurrency?: number; delayMs?: number } = {},
): Promise<HunterVerificationResult[]> {
  const { concurrency = 1, delayMs = 250 } = options // sequential by default: safer with Hunter
  const results: HunterVerificationResult[] = []

  let consecutiveRateLimits = 0
  let circuitOpen = false
  // Errors (invalid key, HTTP error…) used to become "unknown, 0 %" without a
  // trace: a wrong key in production looked like a list of doubtful emails.
  const failures = new Map<string, number>()

  for (let i = 0; i < emails.length; i += concurrency) {
    if (circuitOpen) {
      // Skip remaining emails: Hunter is fried for this run
      for (const email of emails.slice(i)) results.push(unknownVerification(email))
      break
    }

    const chunk = emails.slice(i, i + concurrency)
    const settled = await Promise.allSettled(chunk.map((e) => verifyEmail(e)))

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j]
      const email  = chunk[j] ?? 'unknown'
      if (result.status === 'fulfilled') {
        results.push(result.value)
        // Track consecutive rate-limit responses
        if (result.value.status === 'unknown' && result.value.confidence === 0) {
          consecutiveRateLimits++
          if (consecutiveRateLimits >= CIRCUIT_BREAKER_THRESHOLD) {
            console.warn(`[Hunter] Circuit breaker OPEN after ${consecutiveRateLimits} consecutive rate-limit/unknown responses: skipping remaining ${emails.length - i - chunk.length} verifications`)
            circuitOpen = true
          }
        } else {
          consecutiveRateLimits = 0
        }
      } else {
        results.push(unknownVerification(email))
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
        failures.set(reason, (failures.get(reason) ?? 0) + 1)
      }
    }

    if (!circuitOpen && i + concurrency < emails.length) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  for (const [reason, count] of failures) {
    console.error(`[Hunter] verification failed for ${count}/${emails.length} email(s), marked unknown: ${reason}`)
  }
  return results
}
