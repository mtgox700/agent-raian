import { describe, expect, it } from 'vitest'
import { UNIPILE_SECRET_HEADER, describeRejection, unipileWebhookUrl, verifyUnipileWebhook } from './webhook-auth'

const SECRET = 's3cr3t-value-0123456789'
const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { method: 'POST', headers })

describe('verifyUnipileWebhook', () => {
  it('accepts the secret in the header', () => {
    expect(verifyUnipileWebhook(req('https://x.fr/api/webhooks/unipile', { [UNIPILE_SECRET_HEADER]: SECRET }), SECRET)).toBe('ok')
  })

  it('accepts the secret in the token query parameter', () => {
    expect(verifyUnipileWebhook(req(`https://x.fr/api/webhooks/unipile?token=${SECRET}`), SECRET)).toBe('ok')
  })

  it('rejects a forged call without the secret', () => {
    expect(verifyUnipileWebhook(req('https://x.fr/api/webhooks/unipile'), SECRET)).toBe('rejected')
  })

  it('rejects a wrong secret', () => {
    expect(verifyUnipileWebhook(req('https://x.fr/api/webhooks/unipile?token=nope', { [UNIPILE_SECRET_HEADER]: 'nope' }), SECRET)).toBe('rejected')
  })

  it('ignores a trailing newline or space pasted with the secret, on either side', () => {
    expect(verifyUnipileWebhook(req(`https://x.fr/api/webhooks/unipile?token=${SECRET}`), `${SECRET}\n`)).toBe('ok')
    expect(verifyUnipileWebhook(req(`https://x.fr/api/webhooks/unipile?token=${SECRET}%20`), SECRET)).toBe('ok')
  })

  it('describes a rejection without leaking any secret', () => {
    const text = describeRejection(req('https://x.fr/api/webhooks/unipile?token=short'), SECRET)
    expect(text).toBe(`secret from token query, length 5 (expected ${SECRET.length})`)
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain('short')
  })

  it('reports an unconfigured secret instead of silently accepting', () => {
    expect(verifyUnipileWebhook(req('https://x.fr/api/webhooks/unipile'), undefined)).toBe('unconfigured')
  })
})

describe('unipileWebhookUrl', () => {
  it('carries the secret when configured', () => {
    expect(unipileWebhookUrl('https://www.phantera-tn.com', SECRET)).toBe(`https://www.phantera-tn.com/api/webhooks/unipile?token=${SECRET}`)
  })

  it('is the bare route otherwise', () => {
    expect(unipileWebhookUrl('https://www.phantera-tn.com', undefined)).toBe('https://www.phantera-tn.com/api/webhooks/unipile')
  })
})
