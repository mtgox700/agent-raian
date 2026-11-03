import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

vi.mock('./gmail-client', () => ({ ensureValidToken: vi.fn(async () => 'fresh-token') }))
vi.mock('@/lib/security/crypto', () => ({ decrypt: (s: string) => s, encrypt: (s: string) => s }))

import {
  MAX_ALIASES,
  cleanDisplayName,
  fetchGmailAliases,
  normalizeEmail,
  parseAliases,
  senderAddress,
  smtpAliasAllowed,
} from './sender-identity'
import { canConnectMailbox, canonicalMailboxEmail, connectWithinQuota, disconnectMailbox, setMailboxSharing, validateSenderChoice, type Connector } from './mailbox-access'
import { addSmtpAlias, removeSmtpAlias, syncGmailAliases } from './gmail-aliases'

describe('addresses', () => {
  it('normalizes plain addresses and rejects anything that could break a header', () => {
    expect(normalizeEmail('  Sales@Acme.FR ')).toBe('sales@acme.fr')
    expect(normalizeEmail('a@b')).toBeNull()
    expect(normalizeEmail('x@acme.fr\r\nBcc: victim@evil.com')).toBeNull()
    expect(normalizeEmail('Name <x@acme.fr>')).toBeNull()
    expect(normalizeEmail(42)).toBeNull()
  })

  it('cleans display names of line breaks, brackets and quotes', () => {
    expect(cleanDisplayName('Acme\r\nBcc: x@evil.com')).toBe('Acme Bcc: x@evil.com')
    expect(cleanDisplayName('"Acme" <Sales>')).toBe('Acme Sales')
    expect(cleanDisplayName('   ')).toBeNull()
    expect(cleanDisplayName('x'.repeat(200))?.length).toBe(80)
  })

  it('keeps only well-formed, unique aliases, never more than the cap', () => {
    const raw = [
      { email: 'A@acme.fr', displayName: 'A', source: 'MANUAL' },
      { email: 'a@acme.fr', displayName: 'dup', source: 'MANUAL' },
      { email: 'not an email', source: 'MANUAL' },
      { email: 'b@acme.fr', source: 'HACKED' },
      'junk',
    ]
    expect(parseAliases(raw)).toEqual([{ email: 'a@acme.fr', displayName: 'A', source: 'MANUAL' }])
    expect(parseAliases(null)).toEqual([])
    const many = Array.from({ length: 50 }, (_, i) => ({ email: `u${i}@acme.fr`, source: 'GMAIL' }))
    expect(parseAliases(many)).toHaveLength(MAX_ALIASES)
  })

  it('refuses SMTP aliases on public mail domains, where anyone has an address', () => {
    expect(smtpAliasAllowed('me@gmail.com', 'ceo@gmail.com')).toBe(false)
    expect(smtpAliasAllowed('me@orange.fr', 'other@orange.fr')).toBe(false)
  })

  it('cleans the mailbox display name too before it reaches a From header', () => {
    const mailbox = { email: 'z@agency.fr', displayName: 'Zak\r\nBcc: x@evil.com', provider: 'SMTP', sendAsAliases: [] }
    expect(senderAddress(mailbox, null).name).toBe('Zak Bcc: x@evil.com')
  })

  it('allows an SMTP alias only on the mailbox domain, never the mailbox itself', () => {
    expect(smtpAliasAllowed('z@agency.fr', 'contact@agency.fr')).toBe(true)
    expect(smtpAliasAllowed('z@agency.fr', 'ceo@bank.com')).toBe(false)
    expect(smtpAliasAllowed('z@agency.fr', 'z@agency.fr')).toBe(false)
    expect(smtpAliasAllowed('z@agency.fr', 'x@sub.agency.fr')).toBe(false)
  })

  it('sends as the alias while it exists, otherwise as the mailbox, never for Outlook', () => {
    const mailbox = { email: 'user@gmail.com', displayName: 'User', provider: 'GMAIL', sendAsAliases: [{ email: 'sales@acme.fr', displayName: 'Sales', source: 'GMAIL' }] }
    expect(senderAddress(mailbox, 'sales@acme.fr')).toEqual({ email: 'sales@acme.fr', name: 'Sales', asRequested: true })
    expect(senderAddress(mailbox, 'gone@acme.fr')).toEqual({ email: 'user@gmail.com', name: 'User', asRequested: false })
    expect(senderAddress(mailbox, null)).toEqual({ email: 'user@gmail.com', name: 'User', asRequested: true })
    expect(senderAddress({ ...mailbox, provider: 'OUTLOOK' }, 'sales@acme.fr').email).toBe('user@gmail.com')
  })
})

describe('Gmail « Envoyer en tant que »', () => {
  it('keeps verified aliases, drops the primary address and pending ones', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      sendAs: [
        { sendAsEmail: 'user@gmail.com', isPrimary: true },
        { sendAsEmail: 'sales@acme.fr', displayName: 'Sales', verificationStatus: 'accepted' },
        { sendAsEmail: 'pending@acme.fr', verificationStatus: 'pending' },
      ],
    }), { status: 200 }))
    expect(await fetchGmailAliases('t', fetchImpl)).toEqual([{ email: 'sales@acme.fr', displayName: 'Sales', source: 'GMAIL' }])
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
  })

  it('reports Gmail refusals with their status', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 }))
    await expect(fetchGmailAliases('t', fetchImpl)).rejects.toMatchObject({ status: 403 })
  })
})

type Box = { id: string; workspaceId: string; email: string; provider: string; status: string; ownerUserId: string; sharedWithTeam: boolean; sendAsAliases?: unknown; accessTokenEnc?: string; refreshTokenEnc?: string | null; tokenExpiresAt?: Date | null }
type Camp = { id: string; connectedMailboxId: string | null; fromAlias: string | null; status?: string; senderLostAt?: Date | null; ownerUserId?: string }

function fakeDb(state: { plan?: string; boxes: Box[]; campaigns?: Camp[] }) {
  const campaigns = state.campaigns ?? []
  const db = {
    workspace: { findUnique: async () => ({ plan: state.plan ?? 'BUSINESS' }) },
    connectedMailbox: {
      count: async ({ where }: { where: { workspaceId: string } }) => state.boxes.filter((b) => b.workspaceId === where.workspaceId).length,
      findUnique: async ({ where }: { where: { id?: string; workspaceId_email?: { workspaceId: string; email: string } } }) =>
        state.boxes.find((b) => (where.id ? b.id === where.id : b.workspaceId === where.workspaceId_email?.workspaceId && b.email === where.workspaceId_email?.email)) ?? null,
      findFirst: async ({ where }: { where: { id?: string; workspaceId: string; email?: { equals: string }; OR?: Array<{ ownerUserId?: string; sharedWithTeam?: boolean }> } }) =>
        state.boxes.find((b) => b.workspaceId === where.workspaceId
          && (where.email ? b.email.toLowerCase() === where.email.equals.toLowerCase() : b.id === where.id)
          && (!where.OR || where.OR.some((o) => (o.ownerUserId !== undefined && b.ownerUserId === o.ownerUserId) || (o.sharedWithTeam === true && b.sharedWithTeam)))) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; workspaceId: string }; data: Partial<Box> }) => {
        const hit = state.boxes.filter((b) => b.id === where.id && b.workspaceId === where.workspaceId)
        hit.forEach((b) => Object.assign(b, data))
        return { count: hit.length }
      },
      deleteMany: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const before = state.boxes.length
        state.boxes = state.boxes.filter((b) => !(b.id === where.id && b.workspaceId === where.workspaceId))
        return { count: before - state.boxes.length }
      },
      create: async ({ data }: { data: Box }) => { state.boxes.push(data); return data },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Box> }) => Object.assign(state.boxes.find((b) => b.id === where.id)!, data),
    },
    campaign: {
      findMany: async ({ where }: { where: { connectedMailboxId: string } }) =>
        campaigns.filter((c) => c.connectedMailboxId === where.connectedMailboxId && (c.status ?? 'ACTIVE') !== 'COMPLETED').map((c) => ({ name: c.id })),
      updateMany: async ({ where, data }: { where: { connectedMailboxId: string; status?: string; fromAlias?: { notIn: string[] }; ownerUserId?: { not: string } }; data: Partial<Camp> }) => {
        const hit = campaigns.filter((c) => c.connectedMailboxId === where.connectedMailboxId
          && (!where.status || (c.status ?? 'ACTIVE') === where.status)
          && (!where.ownerUserId || c.ownerUserId !== where.ownerUserId.not)
          && (!where.fromAlias || (c.fromAlias !== null && !where.fromAlias.notIn.includes(c.fromAlias))))
        hit.forEach((c) => Object.assign(c, data))
        return { count: hit.length }
      },
    },
    $executeRaw: async () => 0,
  }
  const client = {
    ...db,
    // Array form: sequential, like Prisma's batch transaction.
    $transaction: async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(client)
      const out: unknown[] = []
      for (const op of arg as Promise<unknown>[]) out.push(await op)
      return out
    },
  }
  return client as unknown as PrismaClient
}

const box = (over: Partial<Box> = {}): Box => ({ id: 'mb1', workspaceId: 'w1', email: 'z@agency.fr', provider: 'SMTP', status: 'CONNECTED', ownerUserId: 'u1', sharedWithTeam: false, sendAsAliases: [], ...over })
const ME: Connector = { userId: 'u1', managesAll: false }
const MINE = { workspaceId: 'w1', ownerUserId: 'u1' }

describe('mailboxes per plan', () => {
  it('lets a workspace reconnect a mailbox it has, even at its limit', async () => {
    const db = fakeDb({ plan: 'PRO', boxes: [box({ email: 'a@x.fr' })] })
    expect(await canConnectMailbox(db, 'w1', 'a@x.fr', ME)).toEqual({ allowed: true })
  })

  it('refuses a new mailbox once the plan limit is reached', async () => {
    const db = fakeDb({ plan: 'PRO', boxes: [box({ email: 'a@x.fr' })] })
    const res = await canConnectMailbox(db, 'w1', 'b@x.fr', ME)
    expect(res.allowed).toBe(false)
    if (!res.allowed) expect(res.message).toContain('1 boîte d')
  })

  it('allows 3 on Business and unlimited on Enterprise', async () => {
    const three = [box({ id: '1', email: '1@x.fr' }), box({ id: '2', email: '2@x.fr' })]
    expect((await canConnectMailbox(fakeDb({ plan: 'BUSINESS', boxes: three }), 'w1', '3@x.fr', ME)).allowed).toBe(true)
    const full = [...three, box({ id: '3', email: '3@x.fr' })]
    expect((await canConnectMailbox(fakeDb({ plan: 'BUSINESS', boxes: full }), 'w1', '4@x.fr', ME)).allowed).toBe(false)
    const many = Array.from({ length: 40 }, (_, i) => box({ id: `${i}`, email: `${i}@x.fr` }))
    expect((await canConnectMailbox(fakeDb({ plan: 'ENTERPRISE', boxes: many }), 'w1', 'new@x.fr', ME)).allowed).toBe(true)
  })
})

describe('connecting mailboxes', () => {
  it('treats an address in another case as the same mailbox', async () => {
    const db = fakeDb({ plan: 'PRO', boxes: [box({ email: 'Bob@X.com' })] })
    expect(await canonicalMailboxEmail(db, 'w1', 'bob@x.com')).toBe('Bob@X.com')
    expect(await canonicalMailboxEmail(db, 'w1', ' New@X.com ')).toBe('new@x.com')
    expect(await canConnectMailbox(db, 'w1', 'BOB@x.COM', ME)).toEqual({ allowed: true })
  })

  it('writes a new mailbox only when the plan has room, under the lock', async () => {
    const state = { plan: 'PRO', boxes: [] as Box[] }
    const db = fakeDb(state)
    const write = vi.fn(async () => 'saved')
    expect(await connectWithinQuota(db, 'w1', 'a@x.fr', ME, write)).toEqual({ allowed: true, result: 'saved' })
    state.boxes.push(box({ email: 'a@x.fr' }))
    const refused = await connectWithinQuota(db, 'w1', 'b@x.fr', ME, write)
    expect(refused.allowed).toBe(false)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('a mailbox used by campaigns is not removed without confirmation; then its active campaigns pause', async () => {
    const campaigns: Camp[] = [
      { id: 'Active', connectedMailboxId: 'mb1', fromAlias: 'contact@agency.fr', status: 'ACTIVE' },
      { id: 'Draft', connectedMailboxId: 'mb1', fromAlias: null, status: 'DRAFT' },
    ]
    const state = { boxes: [box()], campaigns }
    const db = fakeDb(state)
    expect(await disconnectMailbox(db, 'w1', 'mb1', false)).toEqual({ ok: false, inUse: { names: ['Active', 'Draft'], total: 2 } })
    expect(state.boxes).toHaveLength(1)
    expect(await disconnectMailbox(db, 'w1', 'mb1', true)).toEqual({ ok: true, pausedCampaigns: 1 })
    expect(state.boxes).toHaveLength(0)
    // Both must get a sender chosen again before they can restart.
    expect(campaigns).toEqual([
      { id: 'Active', connectedMailboxId: null, fromAlias: null, status: 'PAUSED', senderLostAt: expect.any(Date) },
      { id: 'Draft', connectedMailboxId: null, fromAlias: null, status: 'DRAFT', senderLostAt: expect.any(Date) },
    ])
  })
})

describe('campaign sender choice', () => {
  const gmail = box({ id: 'g1', email: 'user@gmail.com', provider: 'GMAIL', sendAsAliases: [{ email: 'sales@acme.fr', source: 'GMAIL' }] })

  it('accepts the default, a mailbox, or one of its aliases', async () => {
    const db = fakeDb({ boxes: [gmail] })
    expect(await validateSenderChoice(db, MINE, { mailboxId: null, fromAlias: null })).toEqual({ ok: true, mailboxId: null, fromAlias: null })
    expect(await validateSenderChoice(db, MINE, { mailboxId: 'g1', fromAlias: null })).toEqual({ ok: true, mailboxId: 'g1', fromAlias: null })
    expect(await validateSenderChoice(db, MINE, { mailboxId: 'g1', fromAlias: 'Sales@Acme.fr' })).toEqual({ ok: true, mailboxId: 'g1', fromAlias: 'sales@acme.fr' })
    expect(await validateSenderChoice(db, MINE, { mailboxId: 'g1', fromAlias: 'user@gmail.com' })).toEqual({ ok: true, mailboxId: 'g1', fromAlias: null })
  })

  it('refuses another workspace mailbox, a disconnected one, and a foreign alias', async () => {
    const db = fakeDb({ boxes: [gmail, box({ id: 'other', workspaceId: 'w2' }), box({ id: 'off', status: 'EXPIRED' })] })
    expect((await validateSenderChoice(db, MINE, { mailboxId: 'other', fromAlias: null })).ok).toBe(false)
    expect((await validateSenderChoice(db, MINE, { mailboxId: 'off', fromAlias: null })).ok).toBe(false)
    expect((await validateSenderChoice(db, MINE, { mailboxId: 'g1', fromAlias: 'ceo@bank.com' })).ok).toBe(false)
    expect((await validateSenderChoice(db, MINE, { mailboxId: null, fromAlias: 'sales@acme.fr' })).ok).toBe(false)
    expect((await validateSenderChoice(db, MINE, { mailboxId: 'g1', fromAlias: 'x@acme.fr\r\nBcc: y@z.fr' })).ok).toBe(false)
  })

  it('never offers aliases on Outlook', async () => {
    const db = fakeDb({ boxes: [box({ id: 'o1', provider: 'OUTLOOK', email: 'o@corp.fr', sendAsAliases: [{ email: 'x@corp.fr', source: 'MANUAL' }] })] })
    expect((await validateSenderChoice(db, MINE, { mailboxId: 'o1', fromAlias: 'x@corp.fr' })).ok).toBe(false)
  })
})

describe('mailboxes of a team', () => {
  const colleague = box({ id: 'mb2', email: 'colleague@agency.fr', ownerUserId: 'u2' })

  it("a member cannot reconnect a colleague's mailbox (it would replace their credentials); an admin can", async () => {
    const db = fakeDb({ plan: 'ENTERPRISE', boxes: [colleague] })
    const refused = await canConnectMailbox(db, 'w1', 'colleague@agency.fr', ME)
    expect(refused).toMatchObject({ allowed: false, taken: true })
    expect(await canConnectMailbox(db, 'w1', 'colleague@agency.fr', { userId: 'u1', managesAll: true })).toEqual({ allowed: true })
    expect(await canConnectMailbox(db, 'w1', 'colleague@agency.fr', { userId: 'u2', managesAll: false })).toEqual({ allowed: true })
    const write = vi.fn(async () => 'saved')
    expect(await connectWithinQuota(db, 'w1', 'colleague@agency.fr', ME, write)).toMatchObject({ allowed: false, taken: true })
    expect(write).not.toHaveBeenCalled()
  })

  it("a campaign sends only from its owner's mailboxes or a shared one", async () => {
    const db = fakeDb({ boxes: [box(), colleague] })
    expect((await validateSenderChoice(db, MINE, { mailboxId: 'mb2', fromAlias: null })).ok).toBe(false)
    expect((await validateSenderChoice(db, { workspaceId: 'w1', ownerUserId: 'u2' }, { mailboxId: 'mb2', fromAlias: null })).ok).toBe(true)
    colleague.sharedWithTeam = true
    expect((await validateSenderChoice(db, MINE, { mailboxId: 'mb2', fromAlias: null })).ok).toBe(true)
    colleague.sharedWithTeam = false
  })

  it("taking a shared mailbox back stops the other members' campaigns on it, not the owner's", async () => {
    const campaigns: Camp[] = [
      { id: 'OwnersCampaign', connectedMailboxId: 'mb2', fromAlias: null, status: 'ACTIVE', ownerUserId: 'u2' },
      { id: 'ColleaguesCampaign', connectedMailboxId: 'mb2', fromAlias: null, status: 'ACTIVE', ownerUserId: 'u1' },
    ]
    const shared = box({ id: 'mb2', ownerUserId: 'u2', sharedWithTeam: true })
    const db = fakeDb({ boxes: [shared], campaigns })
    expect(await setMailboxSharing(db, 'w1', 'mb2', false)).toEqual({ ok: true, pausedCampaigns: 1 })
    expect(shared.sharedWithTeam).toBe(false)
    expect(campaigns[0]).toMatchObject({ id: 'OwnersCampaign', connectedMailboxId: 'mb2', status: 'ACTIVE' })
    expect(campaigns[1]).toMatchObject({ id: 'ColleaguesCampaign', connectedMailboxId: null, status: 'PAUSED', senderLostAt: expect.any(Date) })
  })
})

describe('alias store', () => {
  it('adds an SMTP alias of the same domain, refuses others, duplicates and other workspaces', async () => {
    const state = { boxes: [box()], campaigns: [] as Camp[] }
    const db = fakeDb(state)
    expect(await addSmtpAlias(db, 'w1', 'mb1', { email: 'Contact@agency.fr', displayName: 'Contact\r\n' })).toMatchObject({ ok: true })
    expect(state.boxes[0].sendAsAliases).toEqual([{ email: 'contact@agency.fr', displayName: 'Contact', source: 'MANUAL' }])
    expect(await addSmtpAlias(db, 'w1', 'mb1', { email: 'contact@agency.fr' })).toMatchObject({ ok: false, status: 409 })
    expect(await addSmtpAlias(db, 'w1', 'mb1', { email: 'ceo@bank.com' })).toMatchObject({ ok: false, status: 422 })
    expect(await addSmtpAlias(db, 'w2', 'mb1', { email: 'x@agency.fr' })).toMatchObject({ ok: false, status: 404 })
  })

  it('refuses hand-entered aliases on a Gmail mailbox', async () => {
    const db = fakeDb({ boxes: [box({ provider: 'GMAIL' })] })
    expect(await addSmtpAlias(db, 'w1', 'mb1', { email: 'x@agency.fr' })).toMatchObject({ ok: false, status: 400 })
  })

  it('removing an alias sends its campaigns from the mailbox again', async () => {
    const campaigns: Camp[] = [
      { id: 'c1', connectedMailboxId: 'mb1', fromAlias: 'contact@agency.fr' },
      { id: 'c2', connectedMailboxId: 'mb1', fromAlias: null },
      { id: 'c3', connectedMailboxId: 'mb1', fromAlias: 'sales@agency.fr' },
    ]
    const db = fakeDb({
      boxes: [box({ sendAsAliases: [{ email: 'contact@agency.fr', source: 'MANUAL' }, { email: 'sales@agency.fr', source: 'MANUAL' }] })],
      campaigns,
    })
    expect(await removeSmtpAlias(db, 'w1', 'mb1', 'contact@agency.fr')).toMatchObject({ ok: true, releasedCampaigns: 1 })
    expect(campaigns.map((c) => c.fromAlias)).toEqual([null, null, 'sales@agency.fr'])
  })

  it('a Gmail sync drops aliases that are no longer verified, and frees their campaigns', async () => {
    const campaigns: Camp[] = [{ id: 'c1', connectedMailboxId: 'g1', fromAlias: 'old@acme.fr' }]
    const state = {
      boxes: [box({ id: 'g1', provider: 'GMAIL', email: 'user@gmail.com', accessTokenEnc: 'tok', refreshTokenEnc: 'ref', tokenExpiresAt: null, sendAsAliases: [{ email: 'old@acme.fr', source: 'GMAIL' }] })],
      campaigns,
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sendAs: [{ sendAsEmail: 'new@acme.fr', verificationStatus: 'accepted' }] }), { status: 200 })))
    const aliases = await syncGmailAliases(fakeDb(state), 'g1')
    vi.unstubAllGlobals()
    expect(aliases.map((a) => a.email)).toEqual(['new@acme.fr'])
    expect(campaigns[0].fromAlias).toBeNull()
  })
})
