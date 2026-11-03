import { beforeEach, describe, expect, it, vi } from 'vitest'

const drain = vi.fn()
vi.mock('@/lib/sequences/drip-queue', () => ({ drainQueuedSends: () => drain() }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('./client', () => ({ inngest: { createFunction: () => ({}), send: vi.fn() }, EMAIL_DRIP_KICK_EVENT: 'kick' }))

const { emailDripHandler, DRIP_MAX_PASSES } = await import('./email-drip')

const pass = (picked: number) => ({ picked, sent: picked ? 1 : 0, skipped: 0, errors: 0, holds: picked ? { PACED: picked - 1 } : {} })

function fakeStep() {
  const sleeps: string[] = []
  return {
    sleeps,
    step: {
      run: <T,>(_id: string, fn: () => Promise<T>) => fn(),
      sleep: async (id: string) => { sleeps.push(id) },
    },
  }
}

describe('emailDripHandler', () => {
  beforeEach(() => drain.mockReset())

  it('stops after one pass when the queue is empty: an idle wake-up costs one query', async () => {
    drain.mockResolvedValue(pass(0))
    const { step, sleeps } = fakeStep()
    await emailDripHandler({ step })
    expect(drain).toHaveBeenCalledTimes(1)
    expect(sleeps).toHaveLength(0)
  })

  it('keeps draining while messages wait their turn, so a 5-minute cron never slows a live campaign', async () => {
    drain.mockResolvedValueOnce(pass(3)).mockResolvedValueOnce(pass(2)).mockResolvedValueOnce(pass(1)).mockResolvedValue(pass(0))
    const { step } = fakeStep()
    const total = await emailDripHandler({ step })
    expect(drain).toHaveBeenCalledTimes(4)
    expect(total.sent).toBe(3)
  })

  it('outlasts the cron interval while busy, and still ends within a bounded number of steps', async () => {
    drain.mockResolvedValue(pass(5))
    const { step, sleeps } = fakeStep()
    await emailDripHandler({ step })
    expect(drain).toHaveBeenCalledTimes(DRIP_MAX_PASSES)
    // 10 s between passes: a busy run lasts longer than the 5-minute cron,
    // so the next run starts at most a minute after this one ends.
    expect((DRIP_MAX_PASSES - 1) * 10).toBeGreaterThan(5 * 60)
    expect(sleeps).toHaveLength(DRIP_MAX_PASSES - 1)
  })
})
