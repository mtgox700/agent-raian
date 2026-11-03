/**
 * Phantera: Deliverability send gate (Phase 1)
 *
 * Single decision point that composes the deliverability primitives into one
 * verdict the send path can call right before dispatching an email:
 *   - is the address suppressed?            (suppression.ts)
 *   - does the mailbox have capacity today?  (send-policy: canSend)
 *   - is the content clean enough?           (send-policy: lintContent)
 *
 * Pure and fully unit-testable. The async DB-bound checks (suppression lookup,
 * today's send count) are resolved by the caller and passed in, so this stays a
 * deterministic policy function.
 */

import { canSend, lintContent, type SendDecision } from './send-policy'

export interface SendGateInput {
  /** Address-level suppression result (from filterSendable / isSuppressed). */
  suppressed: boolean
  /** Mailbox warmup/cap state. */
  mailbox: { ageDays: number; sentToday: number; dailyCap?: number; warmup?: boolean }
  /** The rendered email. */
  content: { subject: string; body: string }
  /** Max acceptable content-lint score (higher = riskier). Default 30. */
  maxContentScore?: number
}

export interface SendGateDecision {
  allowed: boolean
  /** Hard reasons the send was blocked. */
  blocks: string[]
  /** Non-blocking advisories. */
  warnings: string[]
  /** Underlying capacity decision (for telemetry). */
  capacity: SendDecision
}

const DEFAULT_MAX_CONTENT_SCORE = 30

/**
 * Evaluates whether a single email may be sent. `allowed` is true only when the
 * address is not suppressed, the mailbox has capacity, and the content score is
 * within the threshold.
 */
export function evaluateSendGate(input: SendGateInput): SendGateDecision {
  const blocks: string[] = []
  const warnings: string[] = []

  if (input.suppressed) {
    blocks.push('SUPPRESSED: address is on the workspace do-not-contact list')
  }

  const capacity = canSend({
    mailboxAgeDays: input.mailbox.ageDays,
    sentToday: input.mailbox.sentToday,
    dailyCap: input.mailbox.dailyCap,
    warmup: input.mailbox.warmup,
  })
  if (!capacity.allowed) {
    blocks.push(`MAILBOX: ${capacity.reason}`)
  } else if (capacity.remaining <= 3) {
    warnings.push(`MAILBOX_NEAR_CAP: only ${capacity.remaining} sends left today`)
  }

  const maxScore = input.maxContentScore ?? DEFAULT_MAX_CONTENT_SCORE
  const lint = lintContent(input.content.subject, input.content.body)
  if (lint.score > maxScore) {
    blocks.push(`CONTENT: spam risk score ${lint.score} exceeds ${maxScore}`)
  } else if (!lint.ok) {
    for (const issue of lint.issues) warnings.push(`CONTENT_${issue.code}: ${issue.detail}`)
  }

  return {
    allowed: blocks.length === 0,
    blocks,
    warnings,
    capacity,
  }
}
