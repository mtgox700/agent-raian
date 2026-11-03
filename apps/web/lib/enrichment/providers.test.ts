import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  findymailProvider,
  leadmagicProvider,
  prospeoProvider,
  defaultProviders,
  configuredProviders,
} from './providers'
import type { EnrichmentLead } from './waterfall'

const lead: EnrichmentLead = { firstName: 'Jean', lastName: 'Dupont', company: 'ACME', domain: 'acme.com' }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function mockFetch(payload: unknown, ok = true) {
  const f = vi.fn().mockResolvedValue({ ok, json: async () => payload })
  vi.stubGlobal('fetch', f)
  return f
}

describe('findymailProvider', () => {
  it('is gated on FINDYMAIL_API_KEY', () => {
    vi.stubEnv('FINDYMAIL_API_KEY', '')
    expect(findymailProvider().isConfigured()).toBe(false)
    vi.stubEnv('FINDYMAIL_API_KEY', 'k')
    expect(findymailProvider().isConfigured()).toBe(true)
  })

  it('parses a verified email', async () => {
    vi.stubEnv('FINDYMAIL_API_KEY', 'k')
    const f = mockFetch({ contact: { email: 'jean@acme.com' } })
    const r = await findymailProvider().findEmail(lead)
    expect(r).toEqual({ email: 'jean@acme.com', verified: true, confidence: 90, source: 'findymail' })
    const [url, init] = f.mock.calls[0]
    expect(url).toContain('findymail.com')
    expect(init.headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(init.body)).toEqual({ name: 'Jean Dupont', domain: 'acme.com' })
  })

  it('returns null on no email / non-ok', async () => {
    vi.stubEnv('FINDYMAIL_API_KEY', 'k')
    mockFetch({ contact: {} })
    expect(await findymailProvider().findEmail(lead)).toBeNull()
    mockFetch({}, false)
    expect(await findymailProvider().findEmail(lead)).toBeNull()
  })
})

describe('leadmagicProvider', () => {
  it('marks verified only when status is valid', async () => {
    vi.stubEnv('LEADMAGIC_API_KEY', 'k')
    mockFetch({ email: 'a@acme.com', status: 'valid' })
    expect((await leadmagicProvider().findEmail(lead))?.verified).toBe(true)
    mockFetch({ email: 'a@acme.com', status: 'unknown' })
    const r = await leadmagicProvider().findEmail(lead)
    expect(r?.verified).toBe(false)
    expect(r?.source).toBe('leadmagic')
  })
})

describe('prospeoProvider', () => {
  it('parses the nested response shape', async () => {
    vi.stubEnv('PROSPEO_API_KEY', 'k')
    mockFetch({ response: { email: { email: 'p@acme.com', verification: { status: 'valid' } } } })
    const r = await prospeoProvider().findEmail(lead)
    expect(r).toEqual({ email: 'p@acme.com', verified: true, confidence: 92, source: 'prospeo' })
  })
})

describe('registry', () => {
  it('defaultProviders returns the cascade set (Dropcontact leads — GDPR anchor)', () => {
    expect(defaultProviders().map((p) => p.name)).toEqual(['dropcontact', 'leadmagic', 'findymail', 'hunter', 'prospeo'])
  })
  it('configuredProviders filters by env', () => {
    vi.stubEnv('PROSPEO_API_KEY', '')
    vi.stubEnv('FINDYMAIL_API_KEY', 'k')
    vi.stubEnv('LEADMAGIC_API_KEY', '')
    vi.stubEnv('HUNTER_API_KEY', '')
    expect(configuredProviders().map((p) => p.name)).toEqual(['findymail'])
  })
})
