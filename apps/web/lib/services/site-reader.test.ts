import { afterEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/security/safe-http', () => ({ safeGet: transport.get }))

import { readSite } from './site-reader'

const page = `<html><head><title>Acme</title></head><body>${'Acme vend des logiciels de paie aux PME. '.repeat(10)}</body></html>`
const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null })
const html = () => ({ status: 200, headers: headers({ 'content-type': 'text/html' }), text: page })
const redirect = (to: string) => ({ status: 302, headers: headers({ location: to }), text: '' })

afterEach(() => transport.get.mockReset())

describe('site reader (SSRF guard)', () => {
  it('reads a public page', async () => {
    transport.get.mockResolvedValue(html())
    expect((await readSite('acme.example')).title).toBe('Acme')
  })

  it('refuses when the transport finds a private address (checked at connection time)', async () => {
    transport.get.mockRejectedValue(Object.assign(new Error('Host resolves to a non-public address'), { code: 'EPRIVATE' }))
    await expect(readSite('internal.acme.example')).rejects.toThrow('site public')
  })

  it('checks each hop: a redirect to a forbidden name stops before any request', async () => {
    transport.get.mockResolvedValueOnce(redirect('http://localhost/admin'))
    await expect(readSite('acme.example')).rejects.toThrow('non autorisé')
    expect(transport.get).toHaveBeenCalledTimes(1)
  })

  it('a redirect to an internal address is refused by the next hop', async () => {
    transport.get
      .mockResolvedValueOnce(redirect('http://trap.example/latest/meta-data/'))
      .mockRejectedValueOnce(new Error('Host trap.example resolves to a non-public address'))
    await expect(readSite('acme.example')).rejects.toThrow('site public')
    expect(transport.get).toHaveBeenCalledTimes(2)
  })

  it('stops endless redirects and follows a safe one (www)', async () => {
    let n = 0
    transport.get.mockImplementation(async () => redirect(`https://hop${++n}.example/`))
    await expect(readSite('acme.example')).rejects.toThrow('Trop de redirections')
    transport.get.mockReset()
    transport.get.mockResolvedValueOnce(redirect('https://www.acme.example/')).mockResolvedValueOnce(html())
    expect((await readSite('acme.example')).title).toBe('Acme')
    expect(transport.get.mock.calls[1][0].toString()).toBe('https://www.acme.example/')
  })
})
