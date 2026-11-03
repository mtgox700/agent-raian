import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { insightWhere, snoozeInsight } from './http'

const member = { workspaceId: 'w', userId: 'u', role: 'MEMBER' as const }
const viewer = { ...member, role: 'VIEWER' as const }
const admin = { ...member, role: 'ADMIN' as const }

function fakeDb(row: { id: string; campaignId: string | null; status: string } | null) {
  const update = vi.fn().mockResolvedValue({})
  return { db: { insight: { findFirst: vi.fn().mockResolvedValue(row), update } } as unknown as PrismaClient, update }
}

describe('insightWhere', () => {
  it('a member sees the alerts of their campaigns and the workspace ones', () => {
    expect(insightWhere(member)).toEqual({ workspaceId: 'w', OR: [{ campaignId: null }, { campaign: { workspaceId: 'w', ownerUserId: 'u' } }] })
    expect(insightWhere(admin, 'c1')).toEqual({ workspaceId: 'w', campaignId: 'c1', campaign: { workspaceId: 'w' } })
  })
})

describe('snoozeInsight', () => {
  it('7 or 30 days only', async () => {
    const { db } = fakeDb({ id: 'i', campaignId: 'c1', status: 'OPEN' })
    expect((await snoozeInsight(db, member, 'i', 365)).status).toBe(400)
  })

  it('an alert out of sight answers 404, like a missing one', async () => {
    const { db } = fakeDb(null)
    expect((await snoozeInsight(db, member, 'i', 7)).status).toBe(404)
  })

  it('a viewer silences nothing; a member cannot silence the plan quota alert', async () => {
    expect((await snoozeInsight(fakeDb({ id: 'i', campaignId: 'c1', status: 'OPEN' }).db, viewer, 'i', 7)).status).toBe(403)
    expect((await snoozeInsight(fakeDb({ id: 'i', campaignId: null, status: 'OPEN' }).db, member, 'i', 7)).status).toBe(403)
  })

  it('a member silences an alert of their campaign until the chosen day', async () => {
    const { db, update } = fakeDb({ id: 'i', campaignId: 'c1', status: 'OPEN' })
    const now = new Date('2026-10-19T09:00:00Z')
    const res = await snoozeInsight(db, member, 'i', 7, now)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ where: { id: 'i' }, data: { status: 'SNOOZED', snoozedUntil: new Date('2026-10-26T09:00:00Z') } })
  })
})
