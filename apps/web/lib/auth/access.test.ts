import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { PERMISSIONS, can, type Permission } from './permissions'
import { requireAccess, loadAccess } from './access'
import { readActiveWorkspace, signActiveWorkspace } from './active-workspace'

beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', 'b'.repeat(64)))

// ─── Matrix: every permission × every role, written out on purpose ────────────

const EXPECTED: Record<Permission, { OWNER: boolean; ADMIN: boolean; MEMBER: boolean; VIEWER: boolean }> = {
  'workspace.read':  { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: true },
  'campaign.read':   { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: true },
  'campaign.write':  { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'campaign.launch': { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'lead.read':       { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: true },
  'lead.write':      { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'lead.export':     { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'inbox.read':      { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: true },
  'inbox.write':     { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'mailbox.read':    { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: true },
  'mailbox.connect': { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'mailbox.manage':  { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'channel.manage':  { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'phone.reveal':    { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'ai.generate':     { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: false },
  'analyst.ask':     { OWNER: true, ADMIN: true, MEMBER: true,  VIEWER: true },
  'settings.manage': { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
  'team.manage':     { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
  'billing.manage':  { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
  'data.delete':     { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
  'audit.read':      { OWNER: true, ADMIN: true,  MEMBER: false, VIEWER: false },
  'security.manage': { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
  'data.export':     { OWNER: true, ADMIN: true,  MEMBER: false, VIEWER: false },
}

describe('permission matrix', () => {
  it('covers every permission', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PERMISSIONS].sort())
  })

  for (const permission of PERMISSIONS) {
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const) {
      it(`${role} ${EXPECTED[permission][role] ? 'may' : 'may not'} ${permission}`, () => {
        expect(can(role, permission)).toBe(EXPECTED[permission][role])
      })
    }
  }
})

// ─── Access resolution ───────────────────────────────────────────────────────

type Ws = { id: string; plan: string; targetIndustry: null; targetCompanySize: null; sendingDomain: null; createdAt: Date }
const ws = (id: string, day: number): Ws => ({ id, plan: 'BUSINESS', targetIndustry: null, targetCompanySize: null, sendingDomain: null, createdAt: new Date(2026, 0, day) })

function fakeDb(users: Record<string, { id: string; memberships: Array<{ id: string; role: string; workspace: Ws }>; owned: Ws[] }>) {
  return {
    user: {
      findUnique: async ({ where, select }: { where: { clerkId: string }; select: { workspaces: { where: { workspaceId?: string } }; ownedWorkspaces: { where: { id?: string } } } }) => {
        const u = users[where.clerkId]
        if (!u) return null
        const only = select.workspaces.where.workspaceId
        return {
          id: u.id,
          workspaces: u.memberships
            .filter((m) => !only || m.workspace.id === only)
            .map((m) => ({ id: m.id, role: m.role, workspaceId: m.workspace.id, workspace: m.workspace })),
          ownedWorkspaces: u.owned.filter((w) => !select.ownedWorkspaces.where.id || w.id === select.ownedWorkspaces.where.id),
        }
      },
    },
  } as unknown as PrismaClient
}

const A = ws('wsaaaaaaaaaa', 1)
const B = ws('wsbbbbbbbbbb', 2)
const C = ws('wscccccccccc', 3)

const db = fakeDb({
  owner_legacy: { id: 'u1', memberships: [], owned: [A] },
  owner_member: { id: 'u2', memberships: [{ id: 'm2', role: 'MEMBER', workspace: B }], owned: [B] },
  member: { id: 'u3', memberships: [{ id: 'm3', role: 'MEMBER', workspace: A }, { id: 'm4', role: 'VIEWER', workspace: C }], owned: [] },
  viewer: { id: 'u4', memberships: [{ id: 'm5', role: 'VIEWER', workspace: A }], owned: [] },
})

const opts = (extra: object = {}) => ({ db, activeWorkspaceId: null, ...extra })

describe('requireAccess', () => {
  it('refuses a request without a session (401)', async () => {
    expect(await requireAccess(null, 'workspace.read', opts())).toMatchObject({ ok: false, status: 401 })
  })

  it('treats a legacy owner without a membership row as OWNER of their workspace', async () => {
    const r = await requireAccess('owner_legacy', 'billing.manage', opts())
    expect(r).toMatchObject({ ok: true, ctx: { workspaceId: A.id, role: 'OWNER', membershipId: `owner:${A.id}`, userId: 'u1' } })
  })

  it('a membership row wins over ownership: an owner moved to another role keeps that role', async () => {
    expect(await requireAccess('owner_member', 'data.delete', opts())).toMatchObject({ ok: false, status: 403 })
    expect(await requireAccess('owner_member', 'campaign.write', opts())).toMatchObject({ ok: true, ctx: { role: 'MEMBER' } })
  })

  it('a member reaches the workspace they belong to, with their role', async () => {
    expect(await requireAccess('member', 'campaign.write', opts())).toMatchObject({ ok: true, ctx: { workspaceId: A.id, role: 'MEMBER' } })
    expect(await requireAccess('member', 'settings.manage', opts())).toMatchObject({ ok: false, status: 403 })
  })

  it('a viewer reads and cannot write (403)', async () => {
    expect((await requireAccess('viewer', 'lead.read', opts())).ok).toBe(true)
    expect(await requireAccess('viewer', 'lead.write', opts())).toMatchObject({ ok: false, status: 403 })
  })

  it('a workspace the user does not belong to answers 404, never 403', async () => {
    expect(await requireAccess('viewer', 'workspace.read', opts({ workspaceId: B.id }))).toMatchObject({ ok: false, status: 404 })
    expect(await requireAccess('owner_legacy', 'workspace.read', opts({ workspaceId: C.id }))).toMatchObject({ ok: false, status: 404 })
  })

  it('an unknown user has no workspace (404)', async () => {
    expect(await requireAccess('ghost', 'workspace.read', opts())).toMatchObject({ ok: false, status: 404 })
  })

  it('the active workspace is honoured only when the user is a member of it', async () => {
    expect((await loadAccess('member', opts({ activeWorkspaceId: C.id })))?.workspaceId).toBe(C.id)
    expect((await loadAccess('member', opts({ activeWorkspaceId: B.id })))?.workspaceId).toBe(A.id)
  })

  it('an explicitly named workspace wins over the active one', async () => {
    expect((await loadAccess('member', opts({ activeWorkspaceId: C.id, workspaceId: A.id })))?.workspaceId).toBe(A.id)
  })
})

describe('active workspace cookie', () => {
  it('reads back a value signed for the same user', () => {
    expect(readActiveWorkspace('member', signActiveWorkspace('member', C.id))).toBe(C.id)
  })

  it('ignores a value signed for another user, tampered, or malformed', () => {
    const forOther = signActiveWorkspace('viewer', C.id)
    expect(readActiveWorkspace('member', forOther)).toBeNull()
    const value = signActiveWorkspace('member', C.id)
    expect(readActiveWorkspace('member', value.replace(C.id, B.id))).toBeNull()
    expect(readActiveWorkspace('member', `${C.id}.`)).toBeNull()
    expect(readActiveWorkspace('member', 'nope')).toBeNull()
    expect(readActiveWorkspace('member', undefined)).toBeNull()
    expect(readActiveWorkspace('member', `../etc.${'x'.repeat(43)}`)).toBeNull()
  })
})
