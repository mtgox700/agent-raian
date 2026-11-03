import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const quota = vi.hoisted(() => ({ checkCampaignQuota: vi.fn() }))
const mailbox = vi.hoisted(() => ({ validateSenderChoice: vi.fn() }))
vi.mock('@/lib/stripe/quota', () => quota)
vi.mock('@/lib/email/mailbox-access', () => mailbox)

import { deleteDraftCopy, duplicateCampaign, restoreSegment, skipSegment } from './act-opportunities'
import { segmentKey } from './detect-opportunities'

const member = { workspaceId: 'w', userId: 'u', role: 'MEMBER' as const }
const origin = { insightId: 'i1' }

function fakeDb(over: Record<string, unknown> = {}) {
  const sendUpdate = vi.fn().mockResolvedValue({ count: 2 })
  const create = vi.fn().mockResolvedValue({ id: 'copy' })
  const del = vi.fn().mockResolvedValue({})
  const db = {
    campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }), create, delete: del },
    emailSend: { updateMany: sendUpdate },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }]),
    user: { findUnique: vi.fn().mockResolvedValue({ email: 'a@b.c' }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    ...over,
  } as unknown as PrismaClient
  return { db, sendUpdate, create, del }
}

beforeEach(() => {
  quota.checkCampaignQuota.mockReset().mockResolvedValue({ allowed: true, current: 1, limit: 5, planName: 'PRO' })
  mailbox.validateSenderChoice.mockReset().mockResolvedValue({ ok: true, mailboxId: 'm1', fromAlias: null })
})

describe('skipSegment', () => {
  const key = segmentKey('c1', 'industry', 'retail')

  it('takes off only the PENDING first messages it found, and keeps them to undo', async () => {
    const { db, sendUpdate } = fakeDb()
    const r = await skipSegment(db, member, { key, campaignId: 'c1' }, origin)
    expect(r).toEqual({ ok: true, before: { sendIds: ['s1', 's2'], dimension: 'industry', value: 'retail', count: 2 } })
    expect(sendUpdate).toHaveBeenCalledWith({ where: { id: { in: ['s1', 's2'] }, status: 'PENDING' }, data: { status: 'SKIPPED' } })
  })

  it('refuses a key of another campaign, and says when nothing waits any more', async () => {
    expect(await skipSegment(fakeDb().db, member, { key: segmentKey('other', 'industry', 'retail'), campaignId: 'c1' }, origin)).toMatchObject({ status: 409 })
    const { db, sendUpdate } = fakeDb({ $queryRaw: vi.fn().mockResolvedValue([]) })
    expect(await skipSegment(db, member, { key, campaignId: 'c1' }, origin)).toMatchObject({ status: 409 })
    expect(sendUpdate).not.toHaveBeenCalled()
  })

  it('undo puts back only what it took, and only if still skipped', async () => {
    const { db, sendUpdate } = fakeDb()
    await restoreSegment(db, member, 'c1', { sendIds: ['s1', 's2'] }, origin)
    expect(sendUpdate).toHaveBeenCalledWith({ where: { id: { in: ['s1', 's2'] }, campaignId: 'c1', status: 'SKIPPED' }, data: { status: 'PENDING' } })
  })
})

describe('duplicateCampaign', () => {
  const source = { id: 'c1', name: 'Gagnante', goal: 'LEADS', tone: 'PROFESSIONAL', valueProposition: null, aiModel: 'm', leadSource: 'AI_PROSPECTING', targetIndustry: 'SaaS', targetTitles: ['CTO'], targetCompanySizes: [], targetGeos: [], excludedDomains: null, connectedMailboxId: 'm1', fromAlias: null, emailSteps: [{ position: 0, dayOffset: 0, channel: 'EMAIL', subject: 'S', body: 'B', inviteNote: null, isAiGenerated: true, aiScore: 80, aiCritiqueNotes: null }] }

  it('a draft owned by who copies, same messages, nothing sent', async () => {
    const { db, create } = fakeDb({ campaign: { findFirst: vi.fn().mockResolvedValue(source), create: vi.fn().mockResolvedValue({ id: 'copy' }) } })
    const r = await duplicateCampaign(db, member, 'c1', origin)
    expect(r).toEqual({ ok: true, before: { draftId: 'copy' } })
    const data = ((db.campaign.create as ReturnType<typeof vi.fn>).mock.calls[0][0]).data
    expect(data).toMatchObject({ status: 'DRAFT', ownerUserId: 'u', name: 'Gagnante (copie)', connectedMailboxId: 'm1', emailSteps: { create: [expect.objectContaining({ subject: 'S', body: 'B' })] } })
    expect(data.leads).toBeUndefined()
    void create
  })

  it('over the plan: refused; a sender the copier may not use: the default mailbox', async () => {
    quota.checkCampaignQuota.mockResolvedValueOnce({ allowed: false, current: 1, limit: 1, planName: 'STARTER' })
    expect(await duplicateCampaign(fakeDb({ campaign: { findFirst: vi.fn().mockResolvedValue(source), create: vi.fn() } }).db, member, 'c1', origin)).toMatchObject({ status: 402 })
    mailbox.validateSenderChoice.mockResolvedValueOnce({ ok: false, error: 'pas à vous' })
    const create = vi.fn().mockResolvedValue({ id: 'copy' })
    await duplicateCampaign(fakeDb({ campaign: { findFirst: vi.fn().mockResolvedValue(source), create } }).db, member, 'c1', origin)
    expect(create.mock.calls[0][0].data).toMatchObject({ connectedMailboxId: null, fromAlias: null })
  })

  it('undo deletes an untouched draft only', async () => {
    const del = vi.fn()
    const untouched = fakeDb({ campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'copy', status: 'DRAFT', _count: { leads: 0, emailSends: 0 } }), delete: del } })
    expect(await deleteDraftCopy(untouched.db, member, 'copy', origin)).toMatchObject({ ok: true })
    expect(del).toHaveBeenCalled()
    const launched = fakeDb({ campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'copy', status: 'ACTIVE', _count: { leads: 40, emailSends: 40 } }), delete: vi.fn() } })
    expect(await deleteDraftCopy(launched.db, member, 'copy', origin)).toMatchObject({ status: 409 })
  })
})
