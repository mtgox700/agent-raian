import { afterEach, describe, expect, it, vi } from 'vitest'
import { enrichApolloLeadsBatch } from './apollo'

const leads = Array.from({ length: 5 }, (_, i) => ({ apolloId: `a${i}`, firstName: `F${i}`, lastName: `L${i}`, company: 'Co' }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('enrichApolloLeadsBatch', () => {
  it.each([
    [401, 'invalid key'],
    [402, 'payment required'],
    [422, 'insufficient credits'],
  ])('keeps every lead when Apollo stops at the first batch (%s)', async (status, body) => {
    vi.stubEnv('APOLLO_API_KEY', 'test')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => new Response(body, { status }))
    vi.stubGlobal('fetch', fetchMock)

    const results = await enrichApolloLeadsBatch(leads, { batchSize: 2, delayMs: 0 })

    // Leads of the following batches must reach the email waterfall.
    expect(results.map((r) => r.apolloId)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4'])
    expect(results.every((r) => r.email === null)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
