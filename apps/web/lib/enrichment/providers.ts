/**
 * Phantera: Enrichment provider adapters.
 *
 * Real, fetch-based adapters behind the EnrichmentProvider interface. Each is
 * env-gated (isConfigured) so the waterfall skips unconfigured ones. Assembled
 * in the EU strategy order by defaultProviders().
 *
 * Unit-tested with mocked fetch (request shape + response parsing). Live keys
 * are wired via env when available; nothing here runs without its key.
 */

import type { EnrichmentLead, EnrichmentProvider } from './waterfall'
import { findEmailByCompany } from '@/lib/services/hunter'

/** A single provider call never blocks the waterfall longer than this. */
const PROVIDER_TIMEOUT_MS = 12_000

function fullName(lead: EnrichmentLead): string {
  return `${lead.firstName} ${lead.lastName}`.trim()
}

function domainOrCompany(lead: EnrichmentLead): string {
  return (lead.domain || lead.company || '').trim()
}

// ─── Findymail ────────────────────────────────────────────────────────────────
// POST https://app.findymail.com/api/search/name  { name, domain } -> { contact: { email } }
// Returns verified emails (low bounce).

export function findymailProvider(): EnrichmentProvider {
  return {
    name: 'findymail',
    costPerHit: 0.017,
    isConfigured: () => !!process.env.FINDYMAIL_API_KEY,
    async findEmail(lead) {
      const res = await fetch('https://app.findymail.com/api/search/name', {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${process.env.FINDYMAIL_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ name: fullName(lead), domain: domainOrCompany(lead) }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as { contact?: { email?: string } }
      const email = data.contact?.email
      return email ? { email, verified: true, confidence: 90, source: 'findymail' } : null
    },
  }
}

// ─── LeadMagic ────────────────────────────────────────────────────────────────
// POST https://api.leadmagic.io/email-finder { first_name, last_name, domain }
//   -> { email, status }  (pay-on-success)

export function leadmagicProvider(): EnrichmentProvider {
  return {
    name: 'leadmagic',
    costPerHit: 0.01,
    isConfigured: () => !!process.env.LEADMAGIC_API_KEY,
    async findEmail(lead) {
      const res = await fetch('https://api.leadmagic.io/email-finder', {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: {
          'X-API-Key': process.env.LEADMAGIC_API_KEY ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: lead.firstName,
          last_name: lead.lastName,
          domain: domainOrCompany(lead),
        }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as { email?: string; status?: string }
      if (!data.email) return null
      const verified = (data.status ?? '').toLowerCase() === 'valid'
      return { email: data.email, verified, confidence: verified ? 88 : 55, source: 'leadmagic' }
    },
  }
}

// ─── Prospeo ──────────────────────────────────────────────────────────────────
// POST https://api.prospeo.io/email-finder { first_name, last_name, company }
//   -> { response: { email: { email, verification: { status } } } }

export function prospeoProvider(): EnrichmentProvider {
  return {
    name: 'prospeo',
    costPerHit: 0.039,
    isConfigured: () => !!process.env.PROSPEO_API_KEY,
    async findEmail(lead) {
      const res = await fetch('https://api.prospeo.io/email-finder', {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: {
          'X-KEY': process.env.PROSPEO_API_KEY ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: lead.firstName,
          last_name: lead.lastName,
          company: domainOrCompany(lead),
        }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as {
        response?: { email?: { email?: string; verification?: { status?: string } } }
      }
      const email = data.response?.email?.email
      if (!email) return null
      const verified = (data.response?.email?.verification?.status ?? '').toLowerCase() === 'valid'
      return { email, verified, confidence: verified ? 92 : 60, source: 'prospeo' }
    },
  }
}

// ─── Hunter ───────────────────────────────────────────────────────────────────
// Wraps the existing Hunter Email Finder (GET /v2/email-finder). Works from
// first/last name + company. Hunter returns a confidence score (0-100); we treat
// ≥ 80 as verified-grade. Paid plan -> safe to include in the cascade.

export function hunterProvider(): EnrichmentProvider {
  return {
    name: 'hunter',
    costPerHit: 0.02,
    isConfigured: () => !!process.env.HUNTER_API_KEY,
    async findEmail(lead) {
      const company = domainOrCompany(lead)
      if (!company) return null
      const res = await findEmailByCompany(lead.firstName, lead.lastName, company)
      if (!res.email) return null
      const verified = res.score >= 80
      return { email: res.email, verified, confidence: res.score, source: 'hunter' }
    },
  }
}

// ─── Dropcontact (GDPR anchor: EU moat #1) ───────────────────────────────────
// Dropcontact is ASYNC: POST /batch returns a request_id, then GET /batch/{id}
// until the enrichment completes (typically 10-40s). This adapter submits a
// single-record batch and polls with a hard deadline: on timeout it returns
// null so the waterfall falls through to the next provider (never blocking).
//
// Qualification semantics: 'nominative@pro' = person-specific verified pro
// email (the GDPR-clean gold standard); anything else is lower confidence.

const DROPCONTACT_BASE = 'https://api.dropcontact.io'
const DROPCONTACT_POLL_MS = 3_000
const DROPCONTACT_MAX_WAIT_MS = Number(process.env.DROPCONTACT_MAX_WAIT_MS ?? 30_000)

export function dropcontactProvider(): EnrichmentProvider {
  return {
    name: 'dropcontact',
    costPerHit: 0.04,
    isConfigured: () => !!process.env.DROPCONTACT_API_KEY,
    async findEmail(lead) {
      const headers = {
        'X-Access-Token': process.env.DROPCONTACT_API_KEY ?? '',
        'Content-Type': 'application/json',
      }

      // 1. Submit a single-record batch
      const submit = await fetch(`${DROPCONTACT_BASE}/batch`, {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers,
        body: JSON.stringify({
          data: [{
            first_name: lead.firstName,
            last_name:  lead.lastName,
            ...(lead.domain  ? { website: lead.domain }  : {}),
            ...(lead.company ? { company: lead.company } : {}),
          }],
          siren:    false,
          language: 'fr',
        }),
      })
      if (!submit.ok) return null
      const submitted = (await submit.json()) as { request_id?: string }
      if (!submitted.request_id) return null

      // 2. Poll until ready or deadline (waterfall falls through on timeout)
      const deadline = Date.now() + DROPCONTACT_MAX_WAIT_MS
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, DROPCONTACT_POLL_MS))
        const poll = await fetch(`${DROPCONTACT_BASE}/batch/${submitted.request_id}`, {
          headers,
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        })
        if (!poll.ok) return null
        const result = (await poll.json()) as {
          success?: boolean
          data?: Array<{ email?: Array<{ email?: string; qualification?: string }> }>
        }
        if (!result.success) continue // "Not ready yet"

        const candidates = result.data?.[0]?.email ?? []
        const best =
          candidates.find((e) => (e.qualification ?? '').includes('nominative')) ??
          candidates[0]
        if (!best?.email) return null

        const verified = (best.qualification ?? '').includes('nominative')
        return {
          email:      best.email,
          verified,
          confidence: verified ? 95 : 65,
          source:     'dropcontact',
        }
      }
      return null // deadline hit: next provider takes over
    },
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Default EU waterfall order: Dropcontact leads (GDPR anchor, EU moat #1);
 * the cheap fillers below cover the long tail. Cognism (EU premium/mobile)
 * joins at the head once its adapter is wired.
 */
export function defaultProviders(): EnrichmentProvider[] {
  return [
    dropcontactProvider(),
    leadmagicProvider(),
    findymailProvider(),
    hunterProvider(),
    prospeoProvider(),
  ]
}

/** Only the providers that are configured (have a key). */
export function configuredProviders(): EnrichmentProvider[] {
  return defaultProviders().filter((p) => p.isConfigured())
}
