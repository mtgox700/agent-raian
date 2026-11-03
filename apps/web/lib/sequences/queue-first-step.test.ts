import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const quota = vi.hoisted(() => ({ value: { allowed: true, current: 0, limit: Infinity as number } }))
const enqueue = vi.hoisted(() => vi.fn(async (_db: unknown, p: { leadIds: string[] }) => p.leadIds.length))

vi.mock('@/lib/stripe/quota', () => ({ checkEmailSendQuota: vi.fn(async () => quota.value) }))
vi.mock('@/lib/sequences/enqueue', () => ({ enqueueStepSends: enqueue }))

import { queueFirstStep } from './queue-first-step'

function fakeDb(steps: Array<{ id: string; channel: string }>, leadIds: string[]) {
  const findMany = vi.fn(async () => leadIds.map((id) => ({ id })))
  const db = {
    campaignEmailStep: { findMany: vi.fn(async () => steps) },
    lead: { findMany },
  } as unknown as PrismaClient
  return { db, findMany }
}

beforeEach(() => {
  quota.value = { allowed: true, current: 0, limit: Infinity }
  enqueue.mockClear()
})

describe('queueFirstStep', () => {
  it('queues step 1 for the qualifying leads of the campaign', async () => {
    const { db, findMany } = fakeDb([{ id: 's1', channel: 'EMAIL' }, { id: 's2', channel: 'EMAIL' }], ['a', 'b'])
    const result = await queueFirstStep(db, { workspaceId: 'w', campaignId: 'c' })

    expect(result).toEqual({ ok: true, queued: 2, firstStep: { id: 's1', channel: 'EMAIL' }, totalSteps: 2 })
    expect(enqueue).toHaveBeenCalledWith(db, { campaignId: 'c', stepId: 's1', leadIds: ['a', 'b'] })
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where
    expect(where).toMatchObject({ campaignId: 'c', workspaceId: 'w', doNotContact: false })
  })

  it('limits the query to the leads just added', async () => {
    const { db, findMany } = fakeDb([{ id: 's1', channel: 'EMAIL' }], ['n'])
    await queueFirstStep(db, { workspaceId: 'w', campaignId: 'c', leadIds: ['n'] })
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where
    expect(where.id).toEqual({ in: ['n'] })
  })

  it('stops at the send quota left', async () => {
    quota.value = { allowed: true, current: 98, limit: 100 }
    const { db, findMany } = fakeDb([{ id: 's1', channel: 'EMAIL' }], ['a'])
    await queueFirstStep(db, { workspaceId: 'w', campaignId: 'c' })
    expect((findMany.mock.calls[0] as unknown as [{ take: number }])[0].take).toBe(2)
  })

  it('reports why nothing was queued', async () => {
    expect(await queueFirstStep(fakeDb([], ['a']).db, { workspaceId: 'w', campaignId: 'c' })).toEqual({ ok: false, reason: 'NO_STEP' })
    expect(await queueFirstStep(fakeDb([{ id: 's1', channel: 'EMAIL' }], []).db, { workspaceId: 'w', campaignId: 'c' })).toEqual({ ok: false, reason: 'NO_LEADS' })
    quota.value = { allowed: false, current: 100, limit: 100 }
    expect(await queueFirstStep(fakeDb([{ id: 's1', channel: 'EMAIL' }], ['a']).db, { workspaceId: 'w', campaignId: 'c' }))
      .toEqual({ ok: false, reason: 'QUOTA', quota: { current: 100, limit: 100 } })
    expect(enqueue).not.toHaveBeenCalled()
  })
})
