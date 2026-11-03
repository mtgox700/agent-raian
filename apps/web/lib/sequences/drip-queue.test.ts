import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendStepToLead: vi.fn(), checkEmailSendQuota: vi.fn() }))
vi.mock('./send-step', () => ({ sendStepToLead: mocks.sendStepToLead }))
vi.mock('@/lib/stripe/quota', () => ({ checkEmailSendQuota: mocks.checkEmailSendQuota }))

import { drainQueuedSends } from './drip-queue'

const head = (leadId: string, campaignId: string, channel: 'EMAIL' | 'LINKEDIN', workspaceId = 'ws1') => ({
  leadId, campaignId, emailStepId: `step-${leadId}`, workspaceId, channel,
})

const makeDb = (heads: ReturnType<typeof head>[]) => ({ $queryRaw: vi.fn(async () => heads) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  mocks.checkEmailSendQuota.mockResolvedValue({ allowed: true })
  mocks.sendStepToLead.mockResolvedValue({ status: 'sent', sendId: 's', resendMessageId: '' })
})

describe('drainQueuedSends', () => {
  it('sends the head of every queued campaign, LinkedIn included', async () => {
    const db = makeDb([head('l1', 'c1', 'LINKEDIN'), head('e1', 'c2', 'EMAIL')])

    const result = await drainQueuedSends(db as never)

    expect(result).toMatchObject({ picked: 2, sent: 2 })
    expect(mocks.sendStepToLead).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'l1', stepId: 'step-l1' }))
  })

  it('counts a paced or capped head as skipped: it stays queued for the next pass', async () => {
    const db = makeDb([head('a', 'c1', 'EMAIL'), head('b', 'c2', 'EMAIL')])
    mocks.sendStepToLead.mockImplementation(async ({ leadId }: { leadId: string }) =>
      leadId === 'a' ? { status: 'skipped', reason: 'PACED' } : { status: 'sent', sendId: 's', resendMessageId: '' })

    const result = await drainQueuedSends(db as never)

    expect(result).toMatchObject({ sent: 1, skipped: 1, errors: 0, holds: { PACED: 1 } })
  })

  it('holds the workspaces over their monthly quota only', async () => {
    const db = makeDb([head('a', 'c1', 'EMAIL', 'over'), head('b', 'c2', 'EMAIL', 'ok')])
    mocks.checkEmailSendQuota.mockImplementation(async (ws: string) => ({ allowed: ws !== 'over' }))

    const result = await drainQueuedSends(db as never)

    expect(mocks.sendStepToLead).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ sent: 1, skipped: 1, holds: { QUOTA: 1 } })
  })

  it('a thrown send is an error, never a crash of the pass', async () => {
    const db = makeDb([head('a', 'c1', 'EMAIL')])
    mocks.sendStepToLead.mockRejectedValue(new Error('boom'))

    const result = await drainQueuedSends(db as never)

    expect(result).toMatchObject({ errors: 1 })
  })
})
