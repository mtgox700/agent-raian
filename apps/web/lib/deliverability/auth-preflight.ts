/**
 * Phantera: Sending-domain auth preflight (Phase 0)
 *
 * Verifies a sending domain's email authentication BEFORE we ever send from it.
 * A domain that fails SPF / DMARC / MX must be refused: sending from an
 * unauthenticated domain torches deliverability and (post Google/Yahoo 2024
 * bulk rules) gets rejected outright.
 *
 * Uses Node's built-in DNS resolver (no paid service). The resolver is
 * injectable so this is fully unit-testable offline.
 *
 * See docs/VEILLE_DATA_SIGNALS_INFRA.md for the requirements this encodes.
 */

import { Resolver } from 'node:dns/promises'

// ─── Injectable resolver surface (matches node:dns/promises) ─────────────────

export interface MxRecord {
  exchange: string
  priority: number
}

export interface DnsResolver {
  resolveTxt(hostname: string): Promise<string[][]>
  resolveMx(hostname: string): Promise<MxRecord[]>
}

function defaultResolver(): DnsResolver {
  const r = new Resolver()
  return {
    resolveTxt: (h) => r.resolveTxt(h),
    resolveMx: (h) => r.resolveMx(h),
  }
}

// ─── Individual checks ───────────────────────────────────────────────────────

export interface CheckResult {
  ok: boolean
  detail: string
}

/** Join the chunked TXT record fragments node returns into single strings. */
function flattenTxt(records: string[][]): string[] {
  return records.map((parts) => parts.join(''))
}

export async function checkSpf(domain: string, resolver: DnsResolver): Promise<CheckResult> {
  try {
    const txt = flattenTxt(await resolver.resolveTxt(domain))
    const spf = txt.find((r) => r.toLowerCase().startsWith('v=spf1'))
    if (!spf) return { ok: false, detail: 'No SPF record (v=spf1) found' }
    return { ok: true, detail: spf }
  } catch {
    return { ok: false, detail: 'SPF lookup failed (no TXT record)' }
  }
}

export interface DmarcResult extends CheckResult {
  policy: 'none' | 'quarantine' | 'reject' | null
}

export async function checkDmarc(domain: string, resolver: DnsResolver): Promise<DmarcResult> {
  try {
    const txt = flattenTxt(await resolver.resolveTxt(`_dmarc.${domain}`))
    const dmarc = txt.find((r) => r.toLowerCase().startsWith('v=dmarc1'))
    if (!dmarc) return { ok: false, detail: 'No DMARC record found', policy: null }
    const m = /p\s*=\s*(none|quarantine|reject)/i.exec(dmarc)
    const policy = (m?.[1]?.toLowerCase() ?? null) as DmarcResult['policy']
    if (!policy) return { ok: false, detail: 'DMARC record has no policy (p=)', policy: null }
    return { ok: true, detail: dmarc, policy }
  } catch {
    return { ok: false, detail: 'DMARC lookup failed', policy: null }
  }
}

export async function checkMx(domain: string, resolver: DnsResolver): Promise<CheckResult> {
  try {
    const mx = await resolver.resolveMx(domain)
    if (!mx || mx.length === 0) return { ok: false, detail: 'No MX records found' }
    return { ok: true, detail: `${mx.length} MX record(s)` }
  } catch {
    return { ok: false, detail: 'MX lookup failed' }
  }
}

/**
 * DKIM selector varies by provider, so this is best-effort: if a selector is
 * known, we verify the public key exists; otherwise it's reported as unknown
 * (not a hard failure: SPF + DMARC + MX are the blocking checks).
 */
export async function checkDkim(
  domain: string,
  selector: string | null,
  resolver: DnsResolver,
): Promise<CheckResult & { known: boolean }> {
  if (!selector) return { ok: false, known: false, detail: 'No DKIM selector provided (skipped)' }
  try {
    const txt = flattenTxt(await resolver.resolveTxt(`${selector}._domainkey.${domain}`))
    const dkim = txt.find((r) => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('k=rsa') || r.includes('p='))
    if (!dkim) return { ok: false, known: true, detail: 'DKIM selector record not found' }
    return { ok: true, known: true, detail: 'DKIM key present' }
  } catch {
    return { ok: false, known: true, detail: 'DKIM lookup failed' }
  }
}

// ─── Aggregate preflight ─────────────────────────────────────────────────────

export interface PreflightResult {
  domain: string
  ok: boolean
  spf: CheckResult
  dmarc: DmarcResult
  mx: CheckResult
  dkim: CheckResult & { known: boolean }
  failures: string[]
  warnings: string[]
}

export interface PreflightOptions {
  dkimSelector?: string | null
  resolver?: DnsResolver
}

/**
 * Runs the full preflight. `ok` is true only when SPF, DMARC and MX all pass
 * these are the blocking requirements for sending. DKIM (selector-dependent)
 * and a weak DMARC policy (p=none) are surfaced as warnings, not blockers.
 */
export async function runPreflight(domain: string, opts: PreflightOptions = {}): Promise<PreflightResult> {
  const resolver = opts.resolver ?? defaultResolver()
  const dkimSelector = opts.dkimSelector ?? null

  const [spf, dmarc, mx, dkim] = await Promise.all([
    checkSpf(domain, resolver),
    checkDmarc(domain, resolver),
    checkMx(domain, resolver),
    checkDkim(domain, dkimSelector, resolver),
  ])

  const failures: string[] = []
  if (!spf.ok) failures.push(`SPF: ${spf.detail}`)
  if (!dmarc.ok) failures.push(`DMARC: ${dmarc.detail}`)
  if (!mx.ok) failures.push(`MX: ${mx.detail}`)

  const warnings: string[] = []
  if (dmarc.ok && dmarc.policy === 'none') {
    warnings.push('DMARC policy is p=none: strengthen to quarantine/reject before scaling volume')
  }
  if (dkim.known && !dkim.ok) warnings.push(`DKIM: ${dkim.detail}`)
  if (!dkim.known) warnings.push('DKIM selector unknown: could not verify signing key')

  return {
    domain,
    ok: failures.length === 0,
    spf,
    dmarc,
    mx,
    dkim,
    failures,
    warnings,
  }
}
