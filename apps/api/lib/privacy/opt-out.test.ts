import { describe, expect, it, vi } from 'vitest'

process.env.ENCRYPTION_KEY ??= 'ab'.repeat(32)
import { isAnonymisedEmail, objectedLead, optOutHash, optedOut, withoutOptedOut } from './opt-out'
import { filterSendable } from '@/lib/deliverability/suppression'

function dbWith(hashes: string[]) {
  return {
    optOut: {
      findMany: vi.fn(async ({ where }: { where: { emailHash: { in: string[] } } }) =>
        where.emailHash.in.filter((h) => hashes.includes(h)).map((emailHash) => ({ emailHash }))),
    },
  }
}

describe('opt-out fingerprint', () => {
  it('is the same for every spelling of an address, and is not the address', () => {
    const h = optOutHash('Jeanne.Test@Example.com')
    expect(h).toBe(optOutHash('  jeanne.test@example.com '))
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('jeanne')
  })

  it('is keyed: a plain SHA-256 of the address does not match', async () => {
    const { createHash } = await import('node:crypto')
    expect(optOutHash('a@b.co')).not.toBe(createHash('sha256').update('a@b.co').digest('hex'))
  })
})

describe('honouring an objection', () => {
  const objected = 'objected@example.com'
  const db = dbWith([optOutHash(objected)])

  it('finds who objected in the scope asked', async () => {
    expect(await optedOut(db as never, 'ws1', ['OBJECTED@example.com', 'other@example.com'])).toEqual(new Set([objected]))
    expect(db.optOut.findMany.mock.calls[0][0]).toMatchObject({ where: { scope: 'ws1' } })
  })

  it('drops them from a batch about to be stored', async () => {
    const kept = await withoutOptedOut(db as never, 'ws1', [{ email: 'Objected@Example.com', n: 1 }, { email: 'new@example.com', n: 2 }])
    expect(kept.map((k) => k.n)).toEqual([2])
  })

  it('never lets the send gate pass them, even without a flagged lead row', async () => {
    const sendDb = {
      ...dbWith([optOutHash(objected)]),
      lead: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    }
    expect(await filterSendable(sendDb as never, 'ws1', [objected, 'new@example.com'])).toEqual(['new@example.com'])
  })

  it('asks nothing when there is nothing to check', async () => {
    const empty = dbWith([])
    expect(await optedOut(empty as never, 'ws1', [])).toEqual(new Set())
    expect(empty.optOut.findMany).not.toHaveBeenCalled()
  })
})

describe('after the objection', () => {
  it('recognises an anonymised lead, so a late reply is not stored', async () => {
    const leadDb = (email: string) => ({ lead: { findUnique: vi.fn().mockResolvedValue({ email }) } })
    expect(await objectedLead(leadDb('opposition-cl1@invalid.phantera') as never, 'cl1')).toBe(true)
    expect(await objectedLead(leadDb('jeanne@client.fr') as never, 'cl2')).toBe(false)
    expect(isAnonymisedEmail('opposition-x@example.com')).toBe(false)
  })
})
