import { describe, it, expect } from 'vitest'
import { runPreflight, checkSpf, checkDmarc, checkMx, type DnsResolver } from './auth-preflight'

/** Build a fake resolver from canned TXT/MX maps. */
function fakeResolver(txt: Record<string, string[]>, mx: Record<string, { exchange: string; priority: number }[]>): DnsResolver {
  return {
    resolveTxt: async (host) => {
      if (host in txt) return txt[host].map((s) => [s])
      throw new Error('ENOTFOUND')
    },
    resolveMx: async (host) => {
      if (host in mx) return mx[host]
      throw new Error('ENOTFOUND')
    },
  }
}

const goodDomain = 'send.acme.com'
const goodTxt = {
  [goodDomain]: ['v=spf1 include:_spf.google.com ~all'],
  [`_dmarc.${goodDomain}`]: ['v=DMARC1; p=reject; rua=mailto:dmarc@acme.com'],
  [`sel1._domainkey.${goodDomain}`]: ['v=DKIM1; k=rsa; p=MIGfMA0G...'],
}
const goodMx = { [goodDomain]: [{ exchange: 'aspmx.l.google.com', priority: 1 }] }

describe('individual checks', () => {
  it('checkSpf passes on a valid record', async () => {
    const r = await checkSpf(goodDomain, fakeResolver(goodTxt, goodMx))
    expect(r.ok).toBe(true)
  })
  it('checkSpf fails when missing', async () => {
    const r = await checkSpf('nope.com', fakeResolver({}, {}))
    expect(r.ok).toBe(false)
  })
  it('checkDmarc parses the policy', async () => {
    const r = await checkDmarc(goodDomain, fakeResolver(goodTxt, goodMx))
    expect(r.ok).toBe(true)
    expect(r.policy).toBe('reject')
  })
  it('checkMx passes when records exist', async () => {
    const r = await checkMx(goodDomain, fakeResolver(goodTxt, goodMx))
    expect(r.ok).toBe(true)
  })
})

describe('runPreflight', () => {
  it('passes a fully authenticated domain', async () => {
    const r = await runPreflight(goodDomain, { dkimSelector: 'sel1', resolver: fakeResolver(goodTxt, goodMx) })
    expect(r.ok).toBe(true)
    expect(r.failures).toHaveLength(0)
    expect(r.dmarc.policy).toBe('reject')
  })

  it('fails when SPF is missing', async () => {
    const txt = { [`_dmarc.${goodDomain}`]: goodTxt[`_dmarc.${goodDomain}`] }
    const r = await runPreflight(goodDomain, { resolver: fakeResolver(txt, goodMx) })
    expect(r.ok).toBe(false)
    expect(r.failures.some((f) => f.startsWith('SPF'))).toBe(true)
  })

  it('fails when DMARC is missing', async () => {
    const txt = { [goodDomain]: goodTxt[goodDomain] }
    const r = await runPreflight(goodDomain, { resolver: fakeResolver(txt, goodMx) })
    expect(r.ok).toBe(false)
    expect(r.failures.some((f) => f.startsWith('DMARC'))).toBe(true)
  })

  it('fails when MX is missing', async () => {
    const r = await runPreflight(goodDomain, { resolver: fakeResolver(goodTxt, {}) })
    expect(r.ok).toBe(false)
    expect(r.failures.some((f) => f.startsWith('MX'))).toBe(true)
  })

  it('warns on weak DMARC policy (p=none) but still passes', async () => {
    const txt = {
      ...goodTxt,
      [`_dmarc.${goodDomain}`]: ['v=DMARC1; p=none'],
    }
    const r = await runPreflight(goodDomain, { dkimSelector: 'sel1', resolver: fakeResolver(txt, goodMx) })
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => w.includes('p=none'))).toBe(true)
  })

  it('warns when DKIM selector is unknown', async () => {
    const r = await runPreflight(goodDomain, { resolver: fakeResolver(goodTxt, goodMx) })
    expect(r.ok).toBe(true) // DKIM is not blocking
    expect(r.warnings.some((w) => w.toLowerCase().includes('dkim'))).toBe(true)
  })
})
