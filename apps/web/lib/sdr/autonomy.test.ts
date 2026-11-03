import { describe, it, expect } from 'vitest'
import { approvalReasons, requiresApproval, hitsHardGate, emptyGateContext } from './autonomy'

describe('hard gates', () => {
  it('always fire on irreversible/trust-critical actions', () => {
    expect(hitsHardGate({ ...emptyGateContext(), isBooking: true })).toContain('BOOKING')
    expect(hitsHardGate({ ...emptyGateContext(), isComplaintOrLegal: true })).toContain('COMPLAINT_OR_LEGAL')
    expect(hitsHardGate({ ...emptyGateContext(), makesFactualClaim: true })).toContain('FACTUAL_CLAIM')
    expect(hitsHardGate({ ...emptyGateContext(), groundingFailed: true })).toContain('GROUNDING_FAILED')
  })
})

describe('approvalReasons by level', () => {
  const clean = emptyGateContext()
  const firstTouch = { ...emptyGateContext(), isFirstTouchNewDomain: true }

  it('L0 reviews everything', () => {
    expect(requiresApproval('L0_DRAFT', clean)).toBe(true)
    expect(approvalReasons('L0_DRAFT', clean)).toContain('L0_REVIEW_ALL')
  })

  it('L1 gates every first touch but allows routine follow-ups', () => {
    expect(requiresApproval('L1_COPILOT', firstTouch)).toBe(true)
    expect(requiresApproval('L1_COPILOT', clean)).toBe(false) // routine follow-up
  })

  it('L2 gates net-new first touch, follow-ups autonomous', () => {
    expect(requiresApproval('L2_SUPERVISED', firstTouch)).toBe(true)
    expect(requiresApproval('L2_SUPERVISED', clean)).toBe(false)
  })

  it('L3 only stops on hard gates', () => {
    expect(requiresApproval('L3_AUTOPILOT', firstTouch)).toBe(false)
    expect(requiresApproval('L3_AUTOPILOT', clean)).toBe(false)
    expect(requiresApproval('L3_AUTOPILOT', { ...emptyGateContext(), isBooking: true })).toBe(true)
  })

  it('hard gates override autonomy even at L3', () => {
    const ctx = { ...emptyGateContext(), groundingFailed: true }
    expect(requiresApproval('L3_AUTOPILOT', ctx)).toBe(true)
    expect(approvalReasons('L3_AUTOPILOT', ctx)).toContain('GROUNDING_FAILED')
  })
})
