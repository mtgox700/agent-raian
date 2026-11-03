import { describe, it, expect, vi } from 'vitest'
import { sdrSignalHandler, type SdrSignalEventData } from './sdr'
import type { SignalEvent } from '@/lib/signals/router'

function fakeStep() {
  const sendEvent = vi.fn(async () => undefined)
  return { run: async <T>(_id: string, fn: () => Promise<T>) => fn(), sendEvent }
}

const funding: SignalEvent = { type: 'FUNDING', company: 'ACME', country: 'France' }
const personEu: SignalEvent = { type: 'WEBSITE_VISIT_PERSON', country: 'France' }

describe('sdrSignalHandler', () => {
  it('plans and fans out the action for an actionable signal', async () => {
    const step = fakeStep()
    const event = { data: { signal: funding, leadId: 'l1', level: 'L2_SUPERVISED' } as SdrSignalEventData }

    const res = await sdrSignalHandler({ event, step })

    expect(res.action).toBe('SEND') // L2 routine, no first-touch flag
    expect(res.playbook).toBe('funding-congrats')
    expect(step.sendEvent).toHaveBeenCalledTimes(1)
    const [, events] = step.sendEvent.mock.calls[0]
    expect(events[0].name).toBe('phantera/sdr.action_planned')
  })

  it('awaits approval on a first touch at L1', async () => {
    const step = fakeStep()
    const event = {
      data: { signal: funding, leadId: 'l1', level: 'L1_COPILOT', gate: { isFirstTouchNewDomain: true } } as SdrSignalEventData,
    }
    const res = await sdrSignalHandler({ event, step })
    expect(res.action).toBe('AWAIT_APPROVAL')
    expect(res.approvalReasons).toContain('FIRST_TOUCH')
    expect(step.sendEvent).toHaveBeenCalledTimes(1) // still fans to approval pipeline
  })

  it('does not fan out a blocked (non-EU-actionable) signal', async () => {
    const step = fakeStep()
    const event = { data: { signal: personEu, leadId: 'l1', level: 'L3_AUTOPILOT' } as SdrSignalEventData }
    const res = await sdrSignalHandler({ event, step })
    expect(res.action).toBe('BLOCKED')
    expect(step.sendEvent).not.toHaveBeenCalled()
  })
})
