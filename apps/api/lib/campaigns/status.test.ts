import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const quota = vi.hoisted(() => ({ canActivateCampaign: vi.fn() }))
vi.mock('@/lib/stripe/quota', () => quota)

import { changeCampaignStatus } from './status'

const scope = { workspaceId: 'w', userId: 'u', role: 'MEMBER' as const }

function fakeDb(campaign: { id: string; status: string; senderLostAt: Date | null } | null, deletion: Date | null = null) {
  const audit = vi.fn().mockResolvedValue({})
  const update = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', status: data.status, completedAt: data.completedAt ?? null }))
  const db = {
    campaign: { findFirst: vi.fn().mockResolvedValue(campaign), update },
    emailSend: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    workspace: { findUnique: vi.fn().mockResolvedValue({ deletionScheduledFor: deletion }) },
    user: { findUnique: vi.fn().mockResolvedValue({ email: 'a@b.c' }) },
    auditEvent: { create: audit },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as PrismaClient
  return { db, audit, update }
}

beforeEach(() => quota.canActivateCampaign.mockResolvedValue({ allowed: true, current: 0, limit: 5, planName: 'PRO' }))

describe('changeCampaignStatus', () => {
  it('pauses an active campaign and leaves a trace naming the alert it came from', async () => {
    const { db, audit } = fakeDb({ id: 'c1', status: 'ACTIVE', senderLostAt: null })
    const r = await changeCampaignStatus(db, scope, 'c1', 'pause', { insightId: 'i1' })
    expect(r).toMatchObject({ ok: true, campaign: { status: 'PAUSED' } })
    expect(audit.mock.calls[0][0].data).toMatchObject({ action: 'campaign.paused', targetId: 'c1', details: { from: 'ACTIVE', to: 'PAUSED', via: 'alerte', insightId: 'i1' } })
  })

  it('a campaign out of scope is not found; an impossible transition is refused, nothing written', async () => {
    expect(await changeCampaignStatus(fakeDb(null).db, scope, 'c1', 'pause')).toMatchObject({ ok: false, status: 404 })
    const { db, audit, update } = fakeDb({ id: 'c1', status: 'PAUSED', senderLostAt: null })
    expect(await changeCampaignStatus(db, scope, 'c1', 'pause')).toMatchObject({ ok: false, status: 409 })
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('resume: refused without a sender, over the plan, or while the workspace is being deleted', async () => {
    expect(await changeCampaignStatus(fakeDb({ id: 'c1', status: 'PAUSED', senderLostAt: new Date() }).db, scope, 'c1', 'resume')).toMatchObject({ ok: false, reason: 'sender_required' })
    quota.canActivateCampaign.mockResolvedValueOnce({ allowed: false, current: 1, limit: 1, planName: 'STARTER' })
    expect(await changeCampaignStatus(fakeDb({ id: 'c1', status: 'PAUSED', senderLostAt: null }).db, scope, 'c1', 'resume')).toMatchObject({ ok: false, status: 402 })
    expect(await changeCampaignStatus(fakeDb({ id: 'c1', status: 'PAUSED', senderLostAt: null }, new Date()).db, scope, 'c1', 'resume')).toMatchObject({ ok: false, reason: 'deletion_pending' })
  })
})
