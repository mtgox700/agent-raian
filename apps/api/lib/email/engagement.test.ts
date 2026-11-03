import { describe, expect, it } from 'vitest'
import { recordClick, recordOpen } from './engagement'

type Row = { id: string; status: string; openedAt: Date | null; clickedAt: Date | null }

/** A tiny in-memory emailSend that applies updateMany filters like Prisma. */
function fakeDb(row: Row) {
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => {
    const value = (row as Record<string, unknown>)[k]
    if (v && typeof v === 'object' && 'in' in (v as object)) return (v as { in: unknown[] }).in.includes(value)
    return value === v
  })
  return {
    row,
    db: { emailSend: { updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      if (!matches(where)) return { count: 0 }
      Object.assign(row, data)
      return { count: 1 }
    } } } as never,
  }
}

const at = new Date('2026-10-18T10:00:00Z')

describe('engagement', () => {
  it('a first open is recorded once and moves SENT to OPENED', async () => {
    const { db, row } = fakeDb({ id: 's', status: 'SENT', openedAt: null, clickedAt: null })
    expect(await recordOpen(db, 's', at)).toBe(true)
    expect(row).toMatchObject({ status: 'OPENED', openedAt: at })
    expect(await recordOpen(db, 's', at)).toBe(false)
  })

  it('an open arriving after a click keeps CLICKED', async () => {
    const { db, row } = fakeDb({ id: 's', status: 'DELIVERED', openedAt: null, clickedAt: null })
    await recordClick(db, 's', at)
    expect(row).toMatchObject({ status: 'CLICKED', openedAt: at })
    await recordOpen(db, 's', at)
    expect(row.status).toBe('CLICKED')
  })

  it('neither an open nor a click revives a bounced or failed send', async () => {
    for (const status of ['BOUNCED', 'FAILED']) {
      const { db, row } = fakeDb({ id: 's', status, openedAt: null, clickedAt: null })
      expect(await recordOpen(db, 's', at)).toBe(false)
      await recordClick(db, 's', at)
      expect(row).toMatchObject({ status, openedAt: null, clickedAt: null })
    }
  })
})
