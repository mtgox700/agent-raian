import { describe, it, expect } from 'vitest'
import { planSdrAction } from './orchestrator'
import type { SignalEvent } from '@/lib/signals/router'

const funding: SignalEvent = { type: 'FUNDING', company: 'ACME', country: 'France' }
const personDeanonEu: SignalEvent = { type: 'WEBSITE_VISIT_PERSON', country: 'France' }

describe('planSdrAction', () => {
  it('blocks signals that are not EU-actionable', () => {
    const plan = planSdrAction({ signal: personDeanonEu, level: 'L3_AUTOPILOT' })
    expect(plan.action).toBe('BLOCKED')
    expect(plan.blockedReason).toBe('NOT_EU_ACTIONABLE')
  })

  it('L0 always drafts only', () => {
    const plan = planSdrAction({ signal: funding, level: 'L0_DRAFT' })
    expect(plan.action).toBe('DRAFT_ONLY')
  })

  it('L1 awaits approval on a first touch', () => {
    const plan = planSdrAction({ signal: funding, level: 'L1_COPILOT', gate: { isFirstTouchNewDomain: true } })
    expect(plan.action).toBe('AWAIT_APPROVAL')
    expect(plan.approvalReasons).toContain('FIRST_TOUCH')
  })

  it('L2 sends routine follow-ups autonomously', () => {
    const plan = planSdrAction({ signal: funding, level: 'L2_SUPERVISED', gate: { isFirstTouchNewDomain: false } })
    expect(plan.action).toBe('SEND')
  })

  it('L3 sends autonomously when no hard gate', () => {
    const plan = planSdrAction({ signal: funding, level: 'L3_AUTOPILOT', gate: { isFirstTouchNewDomain: true } })
    expect(plan.action).toBe('SEND')
  })

  it('hard gate (grounding failed) forces approval even at L3', () => {
    const plan = planSdrAction({ signal: funding, level: 'L3_AUTOPILOT', gate: { groundingFailed: true } })
    expect(plan.action).toBe('AWAIT_APPROVAL')
    expect(plan.approvalReasons).toContain('GROUNDING_FAILED')
  })

  it('routes the signal to its playbook', () => {
    const plan = planSdrAction({ signal: funding, level: 'L3_AUTOPILOT' })
    expect(plan.route.playbook).toBe('funding-congrats')
  })
})
