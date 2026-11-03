import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const status = vi.hoisted(() => ({ changeCampaignStatus: vi.fn() }))
const sender = vi.hoisted(() => ({ changeCampaignSender: vi.fn() }))
vi.mock('@/lib/campaigns/status', () => status)
vi.mock('@/lib/campaigns/sender', () => sender)

import { takeAction, undoAction } from './act'

const member = { workspaceId: 'w', userId: 'u', role: 'MEMBER' as const }
const viewer = { ...member, role: 'VIEWER' as const }

function fakeDb(insight: { id: string; campaignId: string | null; actions: string[]; status: string } | null, action: Record<string, unknown> | null = null) {
  const create = vi.fn().mockResolvedValue({ id: 'a1' })
  const update = vi.fn().mockResolvedValue({})
  const db = {
    insight: { findFirst: vi.fn().mockResolvedValue(insight), findUnique: vi.fn().mockResolvedValue({ actions: [] }), update: vi.fn().mockResolvedValue({}) },
    insightAction: { create, findFirst: vi.fn().mockResolvedValue(action), update },
    campaign: { findFirst: vi.fn().mockResolvedValue({ fromAlias: 'old@acme.fr' }) },
  } as unknown as PrismaClient
  return { db, create, update }
}
const open = (actions: string[]) => ({ id: 'i1', campaignId: 'c1', actions, status: 'OPEN' })

beforeEach(() => {
  status.changeCampaignStatus.mockReset().mockResolvedValue({ ok: true, campaign: { id: 'c1', status: 'PAUSED', completedAt: null } })
  sender.changeCampaignSender.mockReset().mockResolvedValue({ ok: true, mailboxId: 'm2', fromAlias: null, previous: 'm1' })
})

describe('takeAction', () => {
  it('refuses what is unknown, not offered by the alert, out of sight, or beyond the role', async () => {
    expect(await takeAction(fakeDb(open(['pause'])).db, member, 'i1', 'drop_table')).toMatchObject({ status: 400 })
    expect(await takeAction(fakeDb(open(['pause'])).db, member, 'i1', 'change_sender', { sender: { mailboxId: 'm2', fromAlias: null } })).toMatchObject({ status: 409 })
    expect(await takeAction(fakeDb(null).db, member, 'i1', 'pause')).toMatchObject({ status: 404 })
    expect(await takeAction(fakeDb(open(['pause'])).db, viewer, 'i1', 'pause')).toMatchObject({ status: 403 })
    expect(status.changeCampaignStatus).not.toHaveBeenCalled()
  })

  it('pauses through the campaign service, naming the alert, and keeps what was before', async () => {
    const { db, create } = fakeDb(open(['pause']))
    expect(await takeAction(db, member, 'i1', 'pause')).toEqual({ ok: true, actionId: 'a1' })
    expect(status.changeCampaignStatus).toHaveBeenCalledWith(db, member, 'c1', 'pause', expect.objectContaining({ insightId: 'i1' }))
    expect(create.mock.calls[0][0].data).toMatchObject({ action: 'pause', campaignId: 'c1', actorUserId: 'u', before: { status: 'ACTIVE' } })
    // A pause done is not offered again on the same alert.
    expect((db.insight.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ where: { id: 'i1' }, data: { actions: [] } })
  })

  it('a new sender needs a choice, and the previous one is kept to undo', async () => {
    expect(await takeAction(fakeDb(open(['change_sender'])).db, member, 'i1', 'change_sender')).toMatchObject({ status: 400 })
    const { db, create } = fakeDb(open(['change_sender']))
    await takeAction(db, member, 'i1', 'change_sender', { sender: { mailboxId: 'm2', fromAlias: null } })
    expect(create.mock.calls[0][0].data.before).toEqual({ mailboxId: 'm1', fromAlias: 'old@acme.fr' })
  })

  it('a refused change records nothing', async () => {
    status.changeCampaignStatus.mockResolvedValueOnce({ ok: false, status: 409, error: 'Transition invalide' })
    const { db, create } = fakeDb(open(['pause']))
    expect(await takeAction(db, member, 'i1', 'pause')).toMatchObject({ ok: false, status: 409 })
    expect(create).not.toHaveBeenCalled()
  })
})

describe('undoAction', () => {
  it('resumes a paused campaign, puts the previous sender back, once only', async () => {
    const paused = fakeDb(null, { id: 'a1', insightId: 'i1', campaignId: 'c1', action: 'pause', before: { status: 'ACTIVE' }, revertedAt: null })
    expect(await undoAction(paused.db, member, 'a1')).toEqual({ ok: true, actionId: 'a1' })
    expect(status.changeCampaignStatus).toHaveBeenCalledWith(paused.db, member, 'c1', 'resume', expect.objectContaining({ insightId: 'i1' }))
    expect(paused.update).toHaveBeenCalled()

    const moved = fakeDb(null, { id: 'a2', insightId: 'i1', campaignId: 'c1', action: 'change_sender', before: { mailboxId: 'm1', fromAlias: 'old@acme.fr' }, revertedAt: null })
    await undoAction(moved.db, member, 'a2')
    expect(sender.changeCampaignSender).toHaveBeenCalledWith(moved.db, member, 'c1', { mailboxId: 'm1', fromAlias: 'old@acme.fr' }, expect.anything())

    const done = fakeDb(null, { id: 'a3', insightId: 'i1', campaignId: 'c1', action: 'pause', before: {}, revertedAt: new Date() })
    expect(await undoAction(done.db, member, 'a3')).toMatchObject({ status: 409 })
  })
})
