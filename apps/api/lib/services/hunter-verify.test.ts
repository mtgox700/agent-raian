import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hunterApiKey, verifyEmailBatch } from './hunter'

const ok = (status: string, score: number) =>
  new Response(JSON.stringify({ data: { status, score, block: false, disposable: false, webmail: false } }), { status: 200 })

beforeEach(() => {
  process.env.HUNTER_API_KEY = 'hunter-key'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.HUNTER_API_KEY
})

describe('Hunter verification', () => {
  it('ignores whitespace pasted around the key', () => {
    process.env.HUNTER_API_KEY = '  hunter-key\n'
    expect(hunterApiKey()).toBe('hunter-key')
  })

  it('sends the trimmed key to Hunter', async () => {
    process.env.HUNTER_API_KEY = 'hunter-key\n'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok('valid', 96))
    await verifyEmailBatch(['jeanne@client.fr'], { delayMs: 0 })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('api_key')).toBe('hunter-key')
  })

  it('a rejected key is logged once with its cause instead of silently becoming "unknown 0 %"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }))
    const results = await verifyEmailBatch(['a@x.fr', 'b@x.fr'], { delayMs: 0 })

    expect(results.map((r) => r.status)).toEqual(['unknown', 'unknown'])
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('2/2 email(s)'))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Hunter API key invalide'))
    expect(String((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).not.toContain('hunter-key')
  })

  it('a valid answer is kept as is', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok('valid', 96))
    const [r] = await verifyEmailBatch(['jeanne@client.fr'], { delayMs: 0 })
    expect(r).toMatchObject({ status: 'valid', confidence: 96, verified: true })
    expect(console.error).not.toHaveBeenCalled()
  })
})
