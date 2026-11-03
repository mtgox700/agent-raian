import { describe, expect, it } from 'vitest'
import { assertSafeTarget, publicOnlyLookup } from './safe-http'

describe('safe HTTP target', () => {
  it('only http(s), only ports 80 and 443, never a literal private address', () => {
    expect(() => assertSafeTarget(new URL('https://acme.example/'))).not.toThrow()
    expect(() => assertSafeTarget(new URL('http://acme.example:80/'))).not.toThrow()
    expect(() => assertSafeTarget(new URL('http://acme.example:6379/'))).toThrow('ports 80 and 443')
    expect(() => assertSafeTarget(new URL('https://acme.example:8443/'))).toThrow('ports 80 and 443')
    expect(() => assertSafeTarget(new URL('ftp://acme.example/'))).toThrow('http(s)')
    expect(() => assertSafeTarget(new URL('http://169.254.169.254/'))).toThrow('Non-public')
    expect(() => assertSafeTarget(new URL('http://[::ffff:7f00:1]/'))).toThrow('Non-public')
  })

  it('the lookup the socket uses refuses a name that resolves to a private address', async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      publicOnlyLookup('localhost', {}, (err) => resolve(err))
    })
    expect(error?.code).toBe('EPRIVATE')
  })
})
