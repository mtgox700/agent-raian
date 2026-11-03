import { describe, expect, it } from 'vitest'
import { isPrivateAddress, resolvePublicHost } from './private-network'

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1',
    '::ffff:127.0.0.1', 'not-an-ip',
    // IPv4 hidden in IPv6 forms, and reserved IPv6 ranges
    '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1', '::127.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::',
    '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', 'fec0::1', 'ff02::1', '2001:db8::1', '100::1',
  ])('blocks %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each([
    '8.8.8.8', '185.125.188.10', '172.32.0.1', '2a00:1450:4007::6d',
    '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:0808:0808::1', '2606:4700::1111',
  ])('allows %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})

describe('resolvePublicHost', () => {
  it('returns the first public address', async () => {
    const ip = await resolvePublicHost('mail.example.fr', async () => [{ address: '185.125.188.10' }])
    expect(ip).toBe('185.125.188.10')
  })

  it('rejects a public name that resolves to a private address', async () => {
    await expect(
      resolvePublicHost('evil.example.fr', async () => [{ address: '185.125.188.10' }, { address: '10.0.0.5' }]),
    ).rejects.toThrow(/non-public/)
  })

  it('rejects a literal private IP without resolving it', async () => {
    await expect(resolvePublicHost('127.0.0.1', async () => { throw new Error('should not resolve') }))
      .rejects.toThrow(/non-public/)
  })

  it('rejects a host that does not resolve', async () => {
    await expect(resolvePublicHost('nowhere.example', async () => [])).rejects.toThrow(/does not resolve/)
  })
})

describe('resolvePublicHost address choice', () => {
  it('prefers IPv4: serverless egress often has no IPv6 route', async () => {
    const both = async () => [{ address: '2a00:1450:4007::6d' }, { address: '142.250.0.1' }]
    expect(await resolvePublicHost('smtp.example', both)).toBe('142.250.0.1')
    expect(await resolvePublicHost('v6only.example', async () => [{ address: '2a00:1450:4007::6d' }])).toBe('2a00:1450:4007::6d')
  })
})
