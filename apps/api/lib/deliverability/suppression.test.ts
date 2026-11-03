import { describe, it, expect, vi } from 'vitest'
import { normalizeEmail, suppressEmails, filterSendable, type SuppressionDb } from './suppression'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Jean.Dupont@ACME.COM ')).toBe('jean.dupont@acme.com')
  })
})

function makeDb(suppressedEmails: string[] = []): SuppressionDb {
  const blocked = new Set(suppressedEmails.map(normalizeEmail))
  return {
    lead: {
      updateMany: vi.fn(async ({ where }) => {
        const emails = where.email.in
        return { count: emails.length }
      }),
      findMany: vi.fn(async ({ where }) => {
        return where.email.in
          .filter((e) => blocked.has(normalizeEmail(e)))
          .map((email) => ({ email })) as Array<{ email: string }>
      }),
    },
  }
}

describe('suppressEmails', () => {
  it('normalizes, dedupes and updates matching leads', async () => {
    const db = makeDb()
    const count = await suppressEmails(db, 'ws_1', ['A@x.com', 'a@x.com', 'b@x.com'], 'HARD_BOUNCE')
    expect(count).toBe(2) // deduped to 2
    expect(db.lead.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws_1', email: { in: ['a@x.com', 'b@x.com'], mode: 'insensitive' } },
      data: { doNotContact: true },
    })
  })

  it('also withdraws the address from the shared lead pool (opposition is global)', async () => {
    const globalLead = { updateMany: vi.fn(async () => ({ count: 1 })) }
    const db = { ...makeDb(), globalLead }
    await suppressEmails(db, 'ws_1', ['Jeanne@Client.fr'], 'UNSUBSCRIBE')
    expect(globalLead.updateMany).toHaveBeenCalledWith({
      where: { email: { in: ['jeanne@client.fr'], mode: 'insensitive' } },
      data: { suppressed: true },
    })
  })

  it('no-ops on empty input', async () => {
    const db = makeDb()
    const count = await suppressEmails(db, 'ws_1', ['', '  '])
    expect(count).toBe(0)
    expect(db.lead.updateMany).not.toHaveBeenCalled()
  })
})

describe('filterSendable', () => {
  it('removes suppressed addresses, keeps the rest', async () => {
    const db = makeDb(['blocked@x.com'])
    const sendable = await filterSendable(db, 'ws_1', ['ok@x.com', 'BLOCKED@x.com', 'ok2@x.com'])
    expect(sendable).toEqual(['ok@x.com', 'ok2@x.com'])
  })

  it('returns empty when all suppressed', async () => {
    const db = makeDb(['a@x.com', 'b@x.com'])
    const sendable = await filterSendable(db, 'ws_1', ['a@x.com', 'b@x.com'])
    expect(sendable).toEqual([])
  })

  it('no-ops on empty input', async () => {
    const db = makeDb()
    expect(await filterSendable(db, 'ws_1', [])).toEqual([])
  })
})
