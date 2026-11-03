import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  displayStatus,
  handleRevealWebhook,
  hashToken,
  pickPhone,
  requestPhoneReveal,
  revealCaps,
  revealForUpcomingPhoneSteps,
} from './apollo-reveal'

type Reveal = { id: string; leadId: string; workspaceId: string; apolloId: string; status: string; tokenHash: string; createdAt: Date; credits?: number | null }
type Lead = { id: string; workspaceId: string; apolloId: string | null; phone: string | null; phoneSource?: string | null; doNotContact: boolean }

function fakeDb(leads: Lead[], reveals: Reveal[] = []) {
  const db = {
    lead: {
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        return leads.find((l) => l.id === where.id && l.workspaceId === where.workspaceId) ?? null
      },
      updateMany: async ({ where, data }: { where: { id: string; phone: null; doNotContact: false }; data: Partial<Lead> }) => {
        const lead = leads.find((l) => l.id === where.id && l.phone === null && !l.doNotContact)
        if (!lead) return { count: 0 }
        Object.assign(lead, data)
        return { count: 1 }
      },
    },
    phoneReveal: {
      count: async ({ where }: { where: { workspaceId?: string; createdAt: { gte: Date } } }) =>
        reveals.filter((r) => r.status !== 'REJECTED' && r.createdAt >= where.createdAt.gte && (!where.workspaceId || r.workspaceId === where.workspaceId)).length,
      create: async ({ data }: { data: Omit<Reveal, 'id' | 'createdAt'> }) => {
        if (reveals.some((r) => r.leadId === data.leadId)) throw new Error('unique')
        const row = { ...data, id: `r${reveals.length + 1}`, createdAt: new Date() }
        reveals.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Reveal> }) => {
        const row = reveals.find((r) => r.id === where.id)!
        Object.assign(row, data)
        return row
      },
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<Reveal> }) => {
        const row = reveals.find((r) => r.id === where.id && r.status === where.status)
        if (!row) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      },
      findUnique: async ({ where }: { where: { tokenHash?: string; leadId?: string } }) =>
        reveals.find((r) => (where.tokenHash ? r.tokenHash === where.tokenHash : r.leadId === where.leadId)) ?? null,
    },
    $executeRaw: async () => 0,
    campaignEmailStep: {
      findMany: async () => [
        { id: 's1', campaignId: 'c1', position: 0, channel: 'EMAIL' },
        { id: 's2', campaignId: 'c1', position: 1, channel: 'WHATSAPP' },
        { id: 's3', campaignId: 'c1', position: 2, channel: 'EMAIL' },
      ],
    },
  }
  const client = { ...db, $transaction: async (fn: (tx: unknown) => unknown) => fn(client) }
  return client as unknown as PrismaClient
}

const lead = (over: Partial<Lead> = {}): Lead => ({ id: 'l1', workspaceId: 'w1', apolloId: 'ap1', phone: null, doNotContact: false, ...over })
const okFetch = vi.fn(async () => new Response(JSON.stringify({ request_id: 42 }), { status: 200 }))

beforeEach(() => {
  vi.stubEnv('APOLLO_API_KEY', 'test-key')
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://www.phantera-tn.com')
  vi.stubEnv('APOLLO_PHONE_REVEALS_PER_MONTH', '100')
  vi.stubEnv('APOLLO_PHONE_REVEALS_PER_WORKSPACE_MONTH', '2')
  okFetch.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('budget', () => {
  it('spends nothing until the founder sets a monthly budget', async () => {
    vi.stubEnv('APOLLO_PHONE_REVEALS_PER_MONTH', '')
    expect(revealCaps().platform).toBe(0)
    expect(await requestPhoneReveal(fakeDb([lead()]), { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: okFetch }))
      .toEqual({ ok: false, error: 'DISABLED' })
    expect(okFetch).not.toHaveBeenCalled()
  })

  it('stops at the workspace monthly volume', async () => {
    const now = new Date()
    const reveals = [1, 2].map((i) => ({ id: `x${i}`, leadId: `o${i}`, workspaceId: 'w1', apolloId: 'a', status: 'FOUND', tokenHash: `h${i}`, createdAt: now }))
    expect(await requestPhoneReveal(fakeDb([lead()], reveals), { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: okFetch }))
      .toEqual({ ok: false, error: 'WORKSPACE_CAP' })
    expect(okFetch).not.toHaveBeenCalled()
  })
})

describe('requestPhoneReveal', () => {
  it('asks Apollo once, with a one-time webhook token, and never reveals personal emails', async () => {
    const reveals: Reveal[] = []
    const db = fakeDb([lead()], reveals)
    expect(await requestPhoneReveal(db, { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: okFetch })).toEqual({ ok: true, revealId: 'r1' })

    const url = new URL(String((okFetch.mock.calls[0] as unknown[])[0]))
    expect(url.searchParams.get('id')).toBe('ap1')
    expect(url.searchParams.get('reveal_phone_number')).toBe('true')
    expect(url.searchParams.get('reveal_personal_emails')).toBe('false')
    const hook = new URL(url.searchParams.get('webhook_url')!)
    expect(hook.origin + hook.pathname).toBe('https://www.phantera-tn.com/api/webhooks/apollo-phone')
    expect(reveals[0].tokenHash).toBe(hashToken(hook.searchParams.get('token')!))
    expect(reveals[0].tokenHash).not.toBe(hook.searchParams.get('token'))

    expect(await requestPhoneReveal(db, { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: okFetch }))
      .toEqual({ ok: false, error: 'ALREADY_REQUESTED' })
    expect(okFetch).toHaveBeenCalledTimes(1)
  })

  it('refuses leads that cannot or must not be looked up', async () => {
    const ask = (l: Lead) => requestPhoneReveal(fakeDb([l]), { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: okFetch })
    expect(await ask(lead({ apolloId: null }))).toEqual({ ok: false, error: 'NO_APOLLO_ID' })
    expect(await ask(lead({ phone: '33612345678' }))).toEqual({ ok: false, error: 'HAS_PHONE' })
    expect(await ask(lead({ doNotContact: true }))).toEqual({ ok: false, error: 'DO_NOT_CONTACT' })
    expect(await ask(lead({ workspaceId: 'other' }))).toEqual({ ok: false, error: 'LEAD_NOT_FOUND' })
    expect(okFetch).not.toHaveBeenCalled()
  })

  it('a lookup Apollo refused is not counted and can be retried', async () => {
    const reveals: Reveal[] = []
    const db = fakeDb([lead()], reveals)
    const refusing = vi.fn(async () => new Response('insufficient credits', { status: 422 }))
    expect(await requestPhoneReveal(db, { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: refusing })).toEqual({ ok: false, error: 'APOLLO_ERROR' })
    expect(reveals[0].status).toBe('REJECTED')
    expect(await requestPhoneReveal(db, { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: okFetch })).toEqual({ ok: true, revealId: 'r1' })
    expect(reveals[0].status).toBe('PENDING')
  })

  it('an unanswered call may have been charged: it stays pending, counted, and is never repeated', async () => {
    const reveals: Reveal[] = []
    const db = fakeDb([lead()], reveals)
    const hanging = vi.fn(async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) })
    expect(await requestPhoneReveal(db, { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: hanging })).toEqual({ ok: true, revealId: 'r1' })
    expect(reveals[0].status).toBe('PENDING')
    expect(await requestPhoneReveal(db, { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: okFetch })).toEqual({ ok: false, error: 'ALREADY_REQUESTED' })
    const server = vi.fn(async () => new Response('busy', { status: 503 }))
    const db2 = fakeDb([lead()], [])
    expect(await requestPhoneReveal(db2, { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: server })).toEqual({ ok: true, revealId: 'r1' })
  })

  it('a deleted lead keeps its lookup in the monthly count', async () => {
    const now = new Date()
    const reveals = [{ id: 'x1', leadId: 'gone', workspaceId: 'w1', apolloId: 'a', status: 'FOUND', tokenHash: 'h', createdAt: now }]
    vi.stubEnv('APOLLO_PHONE_REVEALS_PER_WORKSPACE_MONTH', '1')
    expect(await requestPhoneReveal(fakeDb([lead()], reveals), { workspaceId: 'w1', leadId: 'l1', trigger: 'MANUAL' }, { fetchImpl: okFetch }))
      .toEqual({ ok: false, error: 'WORKSPACE_CAP' })
  })
})

describe('pickPhone', () => {
  it('prefers a mobile, skips invalid and do-not-call numbers', () => {
    expect(pickPhone([
      { type_cd: 'work_direct', sanitized_number: '+33140000000', status_cd: 'valid_number' },
      { type_cd: 'mobile', sanitized_number: '+33611111111', status_cd: 'invalid_number' },
      { type_cd: 'mobile', sanitized_number: '+33622222222', dnc_status_cd: 'on_dnc_list' },
      { type_cd: 'mobile', sanitized_number: '+33633333333', status_cd: 'valid_number', dnc_status_cd: 'not_found' },
    ])).toBe('33633333333')
  })

  it('keeps a direct work line when there is no mobile, never the company switchboard', () => {
    expect(pickPhone([{ type_cd: 'work_hq', sanitized_number: '+33100000000' }])).toBeNull()
    expect(pickPhone([{ type_cd: 'work_direct', sanitized_number: '+33140000000' }])).toBe('33140000000')
  })
})

describe('Apollo webhook', () => {
  const token = 'a'.repeat(48)
  const pending = (): Reveal => ({ id: 'r1', leadId: 'l1', workspaceId: 'w1', apolloId: 'ap1', status: 'PENDING', tokenHash: hashToken(token), createdAt: new Date() })
  const payload = { credits_consumed: 8, people: [{ id: 'ap1', status: 'success', phone_numbers: [{ type_cd: 'mobile', sanitized_number: '+33612345678', status_cd: 'valid_number' }] }] }

  it('stores the number on the lead once, whatever Apollo retries', async () => {
    const leads = [lead()]
    const reveals = [pending()]
    const db = fakeDb(leads, reveals)
    expect(await handleRevealWebhook(db, token, payload)).toBe('FOUND')
    expect(leads[0]).toMatchObject({ phone: '33612345678', phoneSource: 'APOLLO' })
    expect(reveals[0]).toMatchObject({ status: 'FOUND', credits: 8 })
    expect(await handleRevealWebhook(db, token, payload)).toBe('ALREADY_DONE')
  })

  it('never overwrites a number the user typed meanwhile, never fills an opted-out lead', async () => {
    const leads = [lead({ phone: '33700000000' })]
    expect(await handleRevealWebhook(fakeDb(leads, [pending()]), token, payload)).toBe('FOUND')
    expect(leads[0].phone).toBe('33700000000')
    const optedOut = [lead({ doNotContact: true })]
    expect(await handleRevealWebhook(fakeDb(optedOut, [pending()]), token, payload)).toBe('FOUND')
    expect(optedOut[0].phone).toBeNull()
  })

  it('shows a lookup Apollo never answered as "no number" after two hours', () => {
    const now = new Date('2026-10-12T12:00:00Z')
    expect(displayStatus({ status: 'PENDING', createdAt: new Date('2026-10-12T11:00:00Z') }, now)).toBe('PENDING')
    expect(displayStatus({ status: 'PENDING', createdAt: new Date('2026-10-12T09:00:00Z') }, now)).toBe('NOT_FOUND')
    expect(displayStatus(null, now)).toBeNull()
  })

  it('rejects unknown tokens and records "no number"', async () => {
    expect(await handleRevealWebhook(fakeDb([lead()], [pending()]), 'b'.repeat(48), payload)).toBe('UNKNOWN_TOKEN')
    expect(await handleRevealWebhook(fakeDb([lead()], [pending()]), '../etc', payload)).toBe('UNKNOWN_TOKEN')
    const reveals = [pending()]
    expect(await handleRevealWebhook(fakeDb([lead()], reveals), token, { people: [{ id: 'ap1', phone_numbers: [] }] })).toBe('NOT_FOUND')
    expect(reveals[0].status).toBe('NOT_FOUND')
  })
})

describe('sequences', () => {
  it('looks up the number when a WhatsApp/SMS step is still ahead, not after it', async () => {
    const reveals: Reveal[] = []
    const db = fakeDb([lead(), lead({ id: 'l2', apolloId: 'ap2' })], reveals)
    const sent = [
      { leadId: 'l1', campaignId: 'c1', stepId: 's1', workspaceId: 'w1' },
      { leadId: 'l2', campaignId: 'c1', stepId: 's3', workspaceId: 'w1' },
    ]
    vi.stubGlobal('fetch', okFetch)
    expect(await revealForUpcomingPhoneSteps(db, sent)).toBe(1)
    expect(reveals.map((r) => [r.leadId, (r as Reveal & { trigger?: string }).trigger])).toEqual([['l1', 'SEQUENCE']])
    vi.unstubAllGlobals()
  })
})
