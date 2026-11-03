/**
 * Phantera: AI SDR durable function.
 *
 * Entry point of the signal-driven SDR: a buying signal arrives as an event, the
 * orchestrator plans the action (route -> autonomy gate -> grounding), and the
 * function either routes to the human-approval pipeline or to autonomous send.
 *
 * The handler is exported separately (testable with a fake step). The heavy
 * downstream steps (research, copy generation, send) are fanned out via a
 * follow-up event so each runs durably with its own retries.
 */

import { inngest, SIGNAL_RECEIVED_EVENT, SDR_ACTION_PLANNED_EVENT } from './client'
import { planSdrAction } from '@/lib/sdr/orchestrator'
import type { SignalEvent } from '@/lib/signals/router'
import type { AutonomyLevel, GateContext } from '@/lib/sdr/autonomy'
import type { StepLike } from './functions'

export interface SdrSignalEventData {
  signal: SignalEvent
  leadId?: string
  level: AutonomyLevel
  gate?: Partial<GateContext>
}

export interface SdrHandlerResult {
  action: string
  playbook: string
  approvalReasons: string[]
}

export async function sdrSignalHandler(
  { event, step }: { event: { data: SdrSignalEventData }; step: StepLike },
): Promise<SdrHandlerResult> {
  const { signal, leadId, level, gate } = event.data

  const plan = await step.run('plan-action', async () => planSdrAction({ signal, level, gate }))

  await step.run('record-plan', async () => {
    console.info('[sdr] plan', {
      leadId,
      type: signal.type,
      action: plan.action,
      playbook: plan.route.playbook,
      reasons: plan.approvalReasons,
      blocked: plan.blockedReason,
    })
    return true
  })

  // Blocked signals (e.g. not EU-actionable) stop here.
  if (plan.action !== 'BLOCKED') {
    await step.sendEvent('sdr-next', [
      { name: SDR_ACTION_PLANNED_EVENT, data: { leadId, plan } },
    ])
  }

  return { action: plan.action, playbook: plan.route.playbook, approvalReasons: plan.approvalReasons }
}

export const sdrSignalFunction = inngest.createFunction(
  {
    id: 'sdr-signal',
    name: 'AI SDR : plan action on signal',
    // Inngest free plan caps per-function concurrency at 5. Keep ≤ 5 so the app
    // sync succeeds (a single over-limit function blocks the ENTIRE sync).
    concurrency: { limit: 5 },
    retries: 3,
    triggers: [{ event: SIGNAL_RECEIVED_EVENT }],
  },
  async ({ event, step }) =>
    sdrSignalHandler({
      event: event as unknown as { data: SdrSignalEventData },
      step: step as unknown as StepLike,
    }),
)
