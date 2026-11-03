/**
 * Phantera: AI SDR orchestrator (decision layer).
 *
 * Pure function that turns (signal + autonomy level + known risk facts) into an
 * action plan: route the signal, then decide whether the SDR may send, must
 * await human approval, may only draft, or is blocked. The durable Inngest SDR
 * function executes this plan; keeping the decision pure makes it testable.
 */

import { routeSignal, type SignalEvent, type SignalRoute } from '@/lib/signals/router'
import {
  approvalReasons,
  emptyGateContext,
  type AutonomyLevel,
  type GateContext,
} from './autonomy'

export type SdrAction = 'BLOCKED' | 'DRAFT_ONLY' | 'AWAIT_APPROVAL' | 'SEND'

export interface SdrPlanInput {
  signal: SignalEvent
  level: AutonomyLevel
  /** Known risk facts about the pending action (first touch, grounding, etc.). */
  gate?: Partial<GateContext>
}

export interface SdrPlan {
  route: SignalRoute
  action: SdrAction
  approvalReasons: string[]
  blockedReason?: string
}

export function planSdrAction({ signal, level, gate }: SdrPlanInput): SdrPlan {
  const route = routeSignal(signal)

  // 1. Compliance gate: never act on a signal that isn't EU-actionable.
  if (!route.euActionable) {
    return { route, action: 'BLOCKED', approvalReasons: [], blockedReason: 'NOT_EU_ACTIONABLE' }
  }

  const ctx: GateContext = { ...emptyGateContext(), ...gate }
  const reasons = approvalReasons(level, ctx)

  // 2. L0 is always human-driven: draft only, never queue a send.
  if (level === 'L0_DRAFT') {
    return { route, action: 'DRAFT_ONLY', approvalReasons: reasons }
  }

  // 3. Any gate reason -> await human approval; otherwise send autonomously.
  if (reasons.length > 0) {
    return { route, action: 'AWAIT_APPROVAL', approvalReasons: reasons }
  }

  return { route, action: 'SEND', approvalReasons: [] }
}
