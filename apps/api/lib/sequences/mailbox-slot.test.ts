import { describe, expect, it, vi } from 'vitest'
import { claimMailboxSlot, pauseMailbox } from './mailbox-slot'

const NOW = new Date('2026-10-07T12:00:00Z')

function makeDb(lastSendAt: Date | null) {
  const row = { id: 'mb1', lastSendAt, sendPausedUntil: null as Date | null }
  const db = {
    connectedMailbox: {
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; OR: Array<{ lastSendAt: null | { lte: Date } }> }; data: { lastSendAt: Date } }) => {
        const free = where.OR.some((c) => (c.lastSendAt === null ? row.lastSendAt === null : row.lastSendAt !== null && row.lastSendAt <= c.lastSendAt.lte))
        if (where.id !== row.id || !free) return { count: 0 }
        row.lastSendAt = data.lastSendAt
        return { count: 1 }
      }),
      update: vi.fn(async ({ data }: { data: { sendPausedUntil: Date } }) => { row.sendPausedUntil = data.sendPausedUntil; return row }),
    },
  }
  return { db, row }
}

describe('claimMailboxSlot', () => {
  it('lets the first email of a mailbox go', async () => {
    const { db, row } = makeDb(null)
    expect(await claimMailboxSlot(db as never, 'mb1', 30, NOW)).toBe(true)
    expect(row.lastSendAt).toEqual(NOW)
  })

  it('holds an email that comes before the gap is over', async () => {
    const { db } = makeDb(new Date(NOW.getTime() - 10_000))
    expect(await claimMailboxSlot(db as never, 'mb1', 30, NOW)).toBe(false)
  })

  it('lets it go once the gap is over', async () => {
    const { db } = makeDb(new Date(NOW.getTime() - 31_000))
    expect(await claimMailboxSlot(db as never, 'mb1', 30, NOW)).toBe(true)
  })

  it('only one of two simultaneous senders wins the slot', async () => {
    const { db } = makeDb(null)
    const [a, b] = await Promise.all([
      claimMailboxSlot(db as never, 'mb1', 30, NOW),
      claimMailboxSlot(db as never, 'mb1', 30, NOW),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
  })
})

describe('pauseMailbox', () => {
  it('pauses until now plus the pause the provider asked for', async () => {
    const { db, row } = makeDb(null)
    const until = await pauseMailbox(db as never, 'mb1', { kind: 'rate', pauseMs: 15 * 60_000 }, NOW)
    expect(until).toEqual(new Date(NOW.getTime() + 15 * 60_000))
    expect(row.sendPausedUntil).toEqual(until)
  })
})
