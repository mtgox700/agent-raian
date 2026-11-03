import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  touch: null as Record<string, unknown> | null,
  sentToday: 0,
  claimed: 1,
  ops: [] as string[],
}))

vi.mock('@/lib/db', () => ({
  db: {
    leadTouch: {
      findFirst: vi.fn(async () => m.touch),
      count: vi.fn(async () => m.sentToday),
      updateMany: vi.fn(async () => { m.ops.push('touch:SENT'); return { count: m.claimed } }),
      update: vi.fn(async ({ data }: { data: { status: string } }) => { m.ops.push(`touch:${data.status}`); return {} }),
    },
    emailSend: { update: vi.fn(async ({ data }: { data: { status: string } }) => { m.ops.push(`send:${data.status}`); return {} }) },
    campaign: { update: vi.fn(async () => { m.ops.push('campaign:+1'); return {} }) },
    lead: { update: vi.fn(async ({ data }: { data: { status: string } }) => { m.ops.push(`lead:${data.status}`); return {} }) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('@/lib/llm/client', () => ({ chat: vi.fn(), isLlmConfigured: () => false }))

import { DAILY_TOUCH_LIMIT, markQueuedSent, skipQueued } from './touch.service'
const OWNER = { workspaceId: 'w1', userId: 'u1', role: 'OWNER' as const }

const queued = (over: Record<string, unknown> = {}) => ({
  id: 't1', status: 'TODO', channel: 'WHATSAPP', emailSendId: 'e1', campaignId: 'c1', leadId: 'l1',
  lead: { doNotContact: false, status: 'new' }, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  m.touch = queued()
  m.sentToday = 0
  m.claimed = 1
  m.ops.length = 0
})

describe('"À envoyer" queue', () => {
  it('sending counts the step as sent, the campaign message and the lead as contacted', async () => {
    expect(await markQueuedSent(OWNER, 't1', 'Bonjour')).toEqual({ ok: true, remainingToday: DAILY_TOUCH_LIMIT - 1 })
    expect(m.ops).toEqual(['touch:SENT', 'send:SENT', 'campaign:+1', 'lead:contacted'])
  })

  it('two taps count once', async () => {
    m.claimed = 0
    expect(await markQueuedSent(OWNER, 't1', 'Bonjour')).toEqual({ ok: false, error: 'ALREADY_DONE' })
    expect(m.ops).toEqual(['touch:SENT'])
  })

  it('a lead who replied meanwhile is taken out of the queue, never messaged', async () => {
    m.touch = queued({ lead: { doNotContact: true, status: 'contacted' } })
    expect(await markQueuedSent(OWNER, 't1', 'Bonjour')).toEqual({ ok: false, error: 'DO_NOT_CONTACT' })
    expect(m.ops).toEqual(['touch:SKIPPED', 'send:SKIPPED'])
  })

  it('stops at the daily volume', async () => {
    m.sentToday = DAILY_TOUCH_LIMIT
    expect(await markQueuedSent(OWNER, 't1', 'Bonjour')).toEqual({ ok: false, error: 'DAILY_LIMIT' })
  })

  it('skipping passes the step over so the sequence goes on', async () => {
    expect(await skipQueued(OWNER, 't1')).toEqual({ ok: true })
    expect(m.ops).toEqual(['touch:SKIPPED', 'send:SKIPPED'])
  })

  it('refuses a message of another workspace or already handled', async () => {
    m.touch = null
    expect(await skipQueued(OWNER, 'tX')).toEqual({ ok: false, error: 'NOT_FOUND' })
    m.touch = queued({ status: 'SENT' })
    expect(await markQueuedSent(OWNER, 't1', 'x')).toEqual({ ok: false, error: 'ALREADY_DONE' })
  })
})
