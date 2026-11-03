import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/security/crypto', () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }))

import { collectGmailHistory } from './gmail-client'

const record = (id: string, ...msgIds: string[]) => ({ id, messagesAdded: msgIds.map((m) => ({ message: { id: m, threadId: 't' } })) })

describe('collectGmailHistory', () => {
  it('reads every page, not only the first one', async () => {
    const pages: Record<string, unknown> = {
      first: { history: [record('101', 'm1')], historyId: '200', nextPageToken: 'p2' },
      p2:    { history: [record('150', 'm2', 'm3')], historyId: '200' },
    }
    const result = await collectGmailHistory('100', async (token) => pages[token ?? 'first'] as never)
    expect(result).toEqual({ messageIds: ['m1', 'm2', 'm3'], historyId: '200' })
  })

  it('resumes after the last record read when the page budget runs out', async () => {
    let n = 0
    const fetchPage = async () => ({ history: [record(String(100 + ++n), `m${n}`)], historyId: '999', nextPageToken: 'more' })
    const result = await collectGmailHistory('100', fetchPage, 2)
    expect(result).toEqual({ messageIds: ['m1', 'm2'], historyId: '102' })
  })

  it('reports an expired history id', async () => {
    expect(await collectGmailHistory('100', async () => 'EXPIRED')).toBe('EXPIRED')
  })
})
