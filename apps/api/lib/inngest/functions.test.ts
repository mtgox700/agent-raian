import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the durable deps so handlers can be tested in isolation.
vi.mock('@/lib/db', () => ({
  db: { campaign: { findMany: vi.fn() } },
}))
vi.mock('@/lib/sequences/process-campaign', () => ({
  processCampaign: vi.fn(),
}))

import { schedulerHandler, processorHandler, inngestFunctions } from './functions'
import { db } from '@/lib/db'
import { processCampaign } from '@/lib/sequences/process-campaign'

type Mock = ReturnType<typeof vi.fn>

/** Fake Inngest step: run executes immediately, sendEvent records calls. */
function fakeStep() {
  const sendEvent = vi.fn(async () => undefined)
  return {
    run: async <T>(_id: string, fn: () => Promise<T>) => fn(),
    sendEvent,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('schedulerHandler', () => {
  it('fans out one event per active campaign', async () => {
    ;(db.campaign.findMany as unknown as Mock).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }])
    const step = fakeStep()

    const res = await schedulerHandler({ step })

    expect(res).toEqual({ fannedOut: 2 })
    expect(step.sendEvent).toHaveBeenCalledTimes(1)
    const [, events] = step.sendEvent.mock.calls[0]
    expect(events).toEqual([
      { name: 'phantera/campaign.process', data: { campaignId: 'c1' } },
      { name: 'phantera/campaign.process', data: { campaignId: 'c2' } },
    ])
  })

  it('does nothing when there are no active campaigns', async () => {
    ;(db.campaign.findMany as unknown as Mock).mockResolvedValue([])
    const step = fakeStep()

    const res = await schedulerHandler({ step })

    expect(res).toEqual({ fannedOut: 0 })
    expect(step.sendEvent).not.toHaveBeenCalled()
  })
})

describe('processorHandler', () => {
  it('delegates to processCampaign with the event campaignId', async () => {
    const result = { campaignId: 'c1', sent: 3, skipped: 0, errors: 0, completed: false }
    ;(processCampaign as unknown as Mock).mockResolvedValue(result)
    const step = fakeStep()

    const res = await processorHandler({ event: { data: { campaignId: 'c1' } }, step })

    expect(res).toEqual(result)
    expect(processCampaign).toHaveBeenCalledWith(db, 'c1')
  })
})

describe('wiring', () => {
  it('exports both durable functions', () => {
    expect(inngestFunctions).toHaveLength(2)
  })
})
