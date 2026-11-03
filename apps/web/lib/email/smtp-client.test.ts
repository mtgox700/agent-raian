import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  dns: new Map<string, string>(),
}))
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }))
vi.mock('@/lib/security/private-network', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/security/private-network')>()
  return { ...real, resolvePublicHost: (host: string) => real.resolvePublicHost(host, async (h) => [{ address: mocks.dns.get(h) ?? '203.0.113.10' }]) }
})

import { testSmtpConnection } from './smtp-client'

afterEach(() => { mocks.createTransport.mockReset(); mocks.dns.clear() })

const params = { port: 587, secure: false, user: 'me@acme.example', password: 'x' }

describe('SMTP connection (SSRF guard)', () => {
  it('connects to the checked public address, certificate verified against the host name', async () => {
    mocks.createTransport.mockReturnValue({ verify: vi.fn(async () => true), close: vi.fn() })
    await testSmtpConnection({ ...params, host: 'smtp.acme.example' })
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: '203.0.113.10', tls: { servername: 'smtp.acme.example' } }))
  })

  it('refuses a host on the private network or the cloud metadata address, before any connection', async () => {
    mocks.dns.set('smtp.internal.example', '10.1.2.3')
    await expect(testSmtpConnection({ ...params, host: 'smtp.internal.example' })).rejects.toThrow('non autorisé')
    await expect(testSmtpConnection({ ...params, host: '169.254.169.254' })).rejects.toThrow('non autorisé')
    await expect(testSmtpConnection({ ...params, host: '127.0.0.1' })).rejects.toThrow('non autorisé')
    expect(mocks.createTransport).not.toHaveBeenCalled()
  })
})
