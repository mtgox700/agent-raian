import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/security/crypto', () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }))

import { collectOutlookDelta } from './outlook-client'

const msg = (id: string) => ({
  id, subject: 's', from: { emailAddress: { address: 'a@b.fr' } },
  body: { content: 'x', contentType: 'text' }, receivedDateTime: '2026-10-06T10:00:00Z',
})

describe('collectOutlookDelta', () => {
  it('follows every next page until the delta link', async () => {
    const pages: Record<string, unknown> = {
      start: { value: [msg('1')], '@odata.nextLink': 'p2' },
      p2:    { value: [msg('2')], '@odata.nextLink': 'p3' },
      p3:    { value: [msg('3')], '@odata.deltaLink': 'delta-final' },
    }
    const { messages, cursor } = await collectOutlookDelta('start', async (u) => pages[u] as never)
    expect(messages.map((m) => m.id)).toEqual(['1', '2', '3'])
    expect(cursor).toBe('delta-final')
  })

  it('resumes from the next page, not the first one, when the page budget runs out', async () => {
    const fetchPage = vi.fn(async (u: string) => ({ value: [msg(u)], '@odata.nextLink': `${u}+` }))
    const { cursor } = await collectOutlookDelta('start', fetchPage, 2)
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(cursor).toBe('start++')
  })

  it('keeps the current link when the server returns neither link', async () => {
    const { cursor } = await collectOutlookDelta('start', async () => ({ value: [] }))
    expect(cursor).toBe('start')
  })
})
