import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { handOverBeforeAccountDeletion, handOverMemberResources, transferMemberResources } from './hand-over'

type Camp = { id: string; workspaceId: string; ownerUserId: string; status: string; connectedMailboxId: string | null; fromAlias: string | null; senderLostAt?: Date | null }
type Box = { id: string; workspaceId: string; ownerUserId: string }
type Chan = { id: string; workspaceId: string; ownerUserId: string; unipileAccountId: string | null }
type Where = Record<string, unknown>

const OWNERS: Record<string, string> = { w1: 'boss', w2: 'leaver', w3: 'leaver', w4: 'leaver' }
// w2: the leaver alone. w3: a co-owner. w4: only an admin and a member besides the leaver.
type TeamRow = { id: string; workspaceId: string; userId: string; role: string }
let TEAMS: TeamRow[] = []
const resetTeams = () => {
  TEAMS = [
    { id: 'm1', workspaceId: 'w3', userId: 'coowner', role: 'OWNER' },
    { id: 'm2', workspaceId: 'w4', userId: 'admin4', role: 'ADMIN' },
    { id: 'm3', workspaceId: 'w4', userId: 'member4', role: 'MEMBER' },
  ]
}

/** Just enough of Prisma's filters for these queries. */
function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'workspace') return OWNERS[row.workspaceId as string] !== (cond as { ownerId: { not: string } }).ownerId.not
    if (cond && typeof cond === 'object' && 'in' in cond) return (cond as { in: unknown[] }).in.includes(row[key])
    return row[key] === cond
  })
}

function fakeDb(state: { campaigns: Camp[]; boxes: Box[]; channels: Chan[] }) {
  const table = <T extends Record<string, unknown>>(rows: () => T[], set: (rows: T[]) => void) => ({
    findMany: async ({ where }: { where: Where }) =>
      rows().filter((r) => matches(r, where)).map((r) => ({ ...r, workspace: { ownerId: OWNERS[r.workspaceId as string] } })),
    updateMany: async ({ where, data }: { where: Where; data: Partial<T> }) => {
      const hit = rows().filter((r) => matches(r, where))
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const before = rows().length
      set(rows().filter((r) => !matches(r, where)))
      return { count: before - rows().length }
    },
  })
  return {
    user: { findUnique: async ({ where }: { where: { clerkId: string } }) => (where.clerkId === 'clerk_leaver' ? { id: 'leaver' } : null) },
    workspace: {
      findMany: async ({ where }: { where: { ownerId: string } }) => Object.entries(OWNERS).filter(([, o]) => o === where.ownerId).map(([id]) => ({ id })),
      update: async ({ where, data }: { where: { id: string }; data: { ownerId: string } }) => { OWNERS[where.id] = data.ownerId; return {} },
    },
    // w3 has a second owner, co-owner: it survives the account.
    workspaceMember: {
      findFirst: async ({ where }: { where: { workspaceId: string; role: string } }) =>
        TEAMS.find((m) => m.workspaceId === where.workspaceId && m.role === where.role) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { role: string } }) => {
        const m = TEAMS.find((t) => t.id === where.id)!
        m.role = data.role
        return m
      },
    },
    $executeRaw: async () => 0,
    campaign: table(() => state.campaigns, (r) => { state.campaigns = r }),
    connectedMailbox: table(() => state.boxes, (r) => { state.boxes = r }),
    connectedChannel: table(() => state.channels, (r) => { state.channels = r }),
  } as unknown as PrismaClient
}

function seed() {
  return {
    campaigns: [
      { id: 'leaverActive', workspaceId: 'w1', ownerUserId: 'leaver', status: 'ACTIVE', connectedMailboxId: 'leaverBox', fromAlias: 'a@x.fr' },
      { id: 'leaverDraft', workspaceId: 'w1', ownerUserId: 'leaver', status: 'DRAFT', connectedMailboxId: null, fromAlias: null },
      { id: 'bossOnLeaverBox', workspaceId: 'w1', ownerUserId: 'boss', status: 'ACTIVE', connectedMailboxId: 'leaverBox', fromAlias: null },
      { id: 'bossOwn', workspaceId: 'w1', ownerUserId: 'boss', status: 'ACTIVE', connectedMailboxId: 'bossBox', fromAlias: null },
    ] as Camp[],
    boxes: [
      { id: 'leaverBox', workspaceId: 'w1', ownerUserId: 'leaver' },
      { id: 'bossBox', workspaceId: 'w1', ownerUserId: 'boss' },
    ] as Box[],
    channels: [
      { id: 'leaverLinkedIn', workspaceId: 'w1', ownerUserId: 'leaver', unipileAccountId: 'acc_1' },
      { id: 'leaverOwnWs', workspaceId: 'w2', ownerUserId: 'leaver', unipileAccountId: 'acc_2' },
    ] as Chan[],
  }
}

describe('a member leaving a workspace', () => {
  it('hands their campaigns over paused, removes their accounts, and stops what sent from them', async () => {
    const state = seed()
    const result = await handOverMemberResources(fakeDb(state), { workspaceId: 'w1', fromUserId: 'leaver', toUserId: 'boss' })

    expect(result).toEqual({ pausedCampaigns: 2, transferredCampaigns: 2, removedMailboxes: 1, channelAccounts: ['acc_1'] })
    const byId = Object.fromEntries(state.campaigns.map((c) => [c.id, c]))
    expect(byId.leaverActive).toMatchObject({ ownerUserId: 'boss', status: 'PAUSED', connectedMailboxId: null, fromAlias: null, senderLostAt: expect.any(Date) })
    expect(byId.leaverDraft).toMatchObject({ ownerUserId: 'boss', status: 'DRAFT' })
    // Another member's campaign that sent from the leaver's mailbox stops too.
    expect(byId.bossOnLeaverBox).toMatchObject({ status: 'PAUSED', connectedMailboxId: null, senderLostAt: expect.any(Date) })
    expect(byId.bossOwn).toMatchObject({ status: 'ACTIVE', connectedMailboxId: 'bossBox' })
    expect(state.boxes.map((b) => b.id)).toEqual(['bossBox'])
    expect(state.channels.map((c) => c.id)).toEqual(['leaverOwnWs'])
  })

  it('with a successor chosen by the team, everything goes to them unchanged', async () => {
    const state = seed()
    const result = await transferMemberResources(fakeDb(state), { workspaceId: 'w1', fromUserId: 'leaver', toUserId: 'boss' })
    expect(result).toEqual({ transferredCampaigns: 2, transferredMailboxes: 1 })
    const byId = Object.fromEntries(state.campaigns.map((c) => [c.id, c]))
    expect(byId.leaverActive).toMatchObject({ ownerUserId: 'boss', status: 'ACTIVE', connectedMailboxId: 'leaverBox' })
    expect(state.boxes.find((b) => b.id === 'leaverBox')).toMatchObject({ ownerUserId: 'boss' })
    expect(state.channels.find((c) => c.id === 'leaverLinkedIn')).toMatchObject({ ownerUserId: 'boss' })
  })

  it('on account deletion, a workspace with a team passes to the next in line; one alone goes with the account', async () => {
    resetTeams()
    const state = seed()
    await handOverBeforeAccountDeletion(fakeDb(state), 'clerk_leaver')
    expect(OWNERS.w3).toBe('coowner')
    // No other owner: the oldest admin becomes owner rather than the team losing everything.
    expect(OWNERS.w4).toBe('admin4')
    expect(TEAMS.find((m) => m.userId === 'admin4')?.role).toBe('OWNER')
    expect(TEAMS.find((m) => m.userId === 'member4')?.role).toBe('MEMBER')
    expect(OWNERS.w2).toBe('leaver')
    Object.assign(OWNERS, { w3: 'leaver', w4: 'leaver' })
  })

  it('on account deletion, only the workspaces the account does not own are handed over', async () => {
    resetTeams()
    const state = seed()
    const results = await handOverBeforeAccountDeletion(fakeDb(state), 'clerk_leaver')

    expect(results).toHaveLength(1)
    expect(state.campaigns.filter((c) => c.ownerUserId === 'leaver')).toEqual([])
    // Its own workspace (w2) is deleted with the account: untouched here.
    expect(state.channels.map((c) => c.id)).toEqual(['leaverOwnWs'])
    expect(await handOverBeforeAccountDeletion(fakeDb(state), 'clerk_unknown')).toEqual([])
  })
})
