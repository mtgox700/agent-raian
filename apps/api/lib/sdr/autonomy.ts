/**
 * Phantera: AI SDR autonomy model.
 *
 * The SDR climbs an autonomy ladder (the customer opts in level by level: we
 * never start at the top). Regardless of level, IRREVERSIBLE / high-risk actions
 * always require a human gate. This is the lesson from the failed autonomous-SDR
 * vendors: ship co-pilot by default, gate the dangerous stuff.
 *
 * Pure and fully unit-testable.
 */

export type AutonomyLevel = 'L0_DRAFT' | 'L1_COPILOT' | 'L2_SUPERVISED' | 'L3_AUTOPILOT'

export const AUTONOMY_RANK: Record<AutonomyLevel, number> = {
  L0_DRAFT: 0,
  L1_COPILOT: 1,
  L2_SUPERVISED: 2,
  L3_AUTOPILOT: 3,
}

/** Context describing the pending action's risk. */
export interface GateContext {
  /** First cold touch to a domain we've never sent to. */
  isFirstTouchNewDomain: boolean
  /** Action books a meeting on a real calendar. */
  isBooking: boolean
  /** Reply/message makes a factual or pricing claim. */
  makesFactualClaim: boolean
  /** Reply classified as complaint / legal / unsubscribe. */
  isComplaintOrLegal: boolean
  /** The generated copy failed the grounding (hallucination) guard. */
  groundingFailed: boolean
}

export function emptyGateContext(): GateContext {
  return {
    isFirstTouchNewDomain: false,
    isBooking: false,
    makesFactualClaim: false,
    isComplaintOrLegal: false,
    groundingFailed: false,
  }
}

/**
 * Hard gates: always require a human regardless of autonomy level. These are
 * irreversible/outward-facing or trust-critical.
 */
export function hitsHardGate(ctx: GateContext): string[] {
  const reasons: string[] = []
  if (ctx.isComplaintOrLegal) reasons.push('COMPLAINT_OR_LEGAL')
  if (ctx.isBooking) reasons.push('BOOKING')
  if (ctx.makesFactualClaim) reasons.push('FACTUAL_CLAIM')
  if (ctx.groundingFailed) reasons.push('GROUNDING_FAILED')
  return reasons
}

/**
 * Whether the action requires human approval at the given autonomy level.
 * Returns the list of gate reasons (empty = may proceed autonomously).
 */
export function approvalReasons(level: AutonomyLevel, ctx: GateContext): string[] {
  const reasons = hitsHardGate(ctx)

  switch (level) {
    case 'L0_DRAFT':
      // Everything is reviewed.
      if (reasons.length === 0) reasons.push('L0_REVIEW_ALL')
      break
    case 'L1_COPILOT':
      // Approve every first touch.
      if (ctx.isFirstTouchNewDomain && !reasons.includes('FIRST_TOUCH')) reasons.push('FIRST_TOUCH')
      break
    case 'L2_SUPERVISED':
      // Approve net-new first touches; routine follow-ups are autonomous.
      if (ctx.isFirstTouchNewDomain && !reasons.includes('FIRST_TOUCH')) reasons.push('FIRST_TOUCH')
      break
    case 'L3_AUTOPILOT':
      // Only hard gates (above). Sampling/monitoring handled elsewhere.
      break
  }

  return reasons
}

export function requiresApproval(level: AutonomyLevel, ctx: GateContext): boolean {
  return approvalReasons(level, ctx).length > 0
}
