import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceRole } from '@prisma/client'
import {
  campaignScope, leadScope, notificationReadScope, notificationScope, ownChannelScope, ownMailboxScope, replyScope,
  seesCampaign, sendableBy, senderServes, touchScope, visibleChannelScope, visibleMailboxScope,
} from './scope'

const as = (role: WorkspaceRole) => ({ workspaceId: 'w1', userId: 'u1', role })
const WHOLE: WorkspaceRole[] = ['OWNER', 'ADMIN', 'VIEWER']

describe('whole-workspace roles see every row of the workspace', () => {
  for (const role of WHOLE) {
    it(role, () => {
      const s = as(role)
      expect(campaignScope(s)).toEqual({ workspaceId: 'w1' })
      expect(leadScope(s)).toEqual({ workspaceId: 'w1' })
      expect(replyScope(s)).toEqual({ campaign: { workspaceId: 'w1' } })
      expect(touchScope(s)).toEqual({ workspaceId: 'w1' })
      expect(visibleMailboxScope(s)).toEqual({ workspaceId: 'w1' })
      expect(ownMailboxScope(s)).toEqual({ workspaceId: 'w1' })
      expect(visibleChannelScope(s)).toEqual({ workspaceId: 'w1' })
      expect(ownChannelScope(s)).toEqual({ workspaceId: 'w1' })
    })
  }
})

describe('a MEMBER sees their own rows only', () => {
  const s = as('MEMBER')

  it('their campaigns, and what belongs to them', () => {
    expect(campaignScope(s)).toEqual({ workspaceId: 'w1', ownerUserId: 'u1' })
    expect(replyScope(s)).toEqual({ campaign: { workspaceId: 'w1', ownerUserId: 'u1' } })
  })

  it('the leads of their campaigns and the shared pool', () => {
    expect(leadScope(s)).toEqual({ workspaceId: 'w1', OR: [{ campaignId: null }, { campaign: { ownerUserId: 'u1' } }] })
    expect(touchScope(s)).toEqual({ workspaceId: 'w1', lead: leadScope(s) })
  })

  it('their mailboxes and the shared ones; they manage only theirs', () => {
    expect(visibleMailboxScope(s)).toEqual({ workspaceId: 'w1', OR: [{ ownerUserId: 'u1' }, { sharedWithTeam: true }] })
    expect(ownMailboxScope(s)).toEqual({ workspaceId: 'w1', ownerUserId: 'u1' })
    expect(ownChannelScope(s)).toEqual({ workspaceId: 'w1', ownerUserId: 'u1' })
  })

  it('a campaign loaded by id is theirs or not found', () => {
    expect(seesCampaign(s, { workspaceId: 'w1', ownerUserId: 'u1' })).toBe(true)
    expect(seesCampaign(s, { workspaceId: 'w1', ownerUserId: 'u2' })).toBe(false)
    expect(seesCampaign(as('ADMIN'), { workspaceId: 'w1', ownerUserId: 'u2' })).toBe(true)
    expect(seesCampaign(as('OWNER'), { workspaceId: 'w2', ownerUserId: 'u1' })).toBe(false)
  })
})

describe('senders', () => {
  it('serve their owner, or everyone once shared, whatever the role of who looks', () => {
    expect(sendableBy('u2')).toEqual({ OR: [{ ownerUserId: 'u2' }, { sharedWithTeam: true }] })
    expect(senderServes({ ownerUserId: 'u1', sharedWithTeam: false }, 'u1')).toBe(true)
    expect(senderServes({ ownerUserId: 'u1', sharedWithTeam: false }, 'u2')).toBe(false)
    expect(senderServes({ ownerUserId: 'u1', sharedWithTeam: true }, 'u2')).toBe(true)
  })
})

describe('notifications', () => {
  it('a MEMBER gets theirs, their campaigns’, and the workspace-wide ones', async () => {
    const findMany = vi.fn(async () => [{ id: 'c1' }, { id: 'c2' }])
    const where = await notificationScope({ campaign: { findMany } }, as('MEMBER'))
    expect(findMany).toHaveBeenCalledWith({ where: { workspaceId: 'w1', ownerUserId: 'u1' }, select: { id: true } })
    expect(where).toEqual({
      workspaceId: 'w1',
      OR: [
        { userId: 'u1' },
        { userId: null, campaignId: { in: ['c1', 'c2'] } },
        { userId: null, campaignId: null, leadId: null },
      ],
    })
  })

  it('marking as read: a member never marks the workspace-wide ones, an admin never a member’s own', async () => {
    const findMany = vi.fn(async () => [{ id: 'c1' }])
    expect(await notificationReadScope({ campaign: { findMany } }, as('MEMBER'))).toEqual({
      workspaceId: 'w1',
      OR: [{ userId: 'u1' }, { userId: null, campaignId: { in: ['c1'] } }],
    })
    expect(await notificationReadScope({ campaign: { findMany } }, as('ADMIN'))).toEqual({
      workspaceId: 'w1', OR: [{ userId: null }, { userId: 'u1' }],
    })
  })

  it('whole-workspace roles get all of them, without a lookup', async () => {
    const findMany = vi.fn()
    expect(await notificationScope({ campaign: { findMany } }, as('ADMIN'))).toEqual({ workspaceId: 'w1' })
    expect(findMany).not.toHaveBeenCalled()
  })
})
