/**
 * Decides whether a PENDING channel can claim a Unipile account when the
 * hosted-auth webhook never reached us (e.g. a flow started from localhost).
 *
 * The account list carries no link to our channel id, so claiming is only
 * safe when it is unambiguous: one unlinked account of the right type, created
 * during this connection attempt, and no other attempt in progress anywhere on
 * the platform. Otherwise the row waits for the webhook: attaching someone
 * else's LinkedIn account to a workspace is worse than a delayed connection.
 */

import type { UnipileAccount } from './unipile'

/** How long after the attempt started an account may still be its result. */
export const CLAIM_WINDOW_MS = 60 * 60 * 1000
const CLOCK_SKEW_MS = 2 * 60 * 1000

export interface PendingAttempt {
  provider: string
  createdAt: Date
}

export function pickClaimableAccount(
  attempt: PendingAttempt,
  unlinkedAccounts: UnipileAccount[],
  otherPendingAttempts: number,
): UnipileAccount | null {
  if (otherPendingAttempts > 0) return null
  const start = attempt.createdAt.getTime() - CLOCK_SKEW_MS
  const end = attempt.createdAt.getTime() + CLAIM_WINDOW_MS
  const candidates = unlinkedAccounts.filter((a) =>
    a.type.includes(attempt.provider) &&
    a.createdAt !== null &&
    a.createdAt.getTime() >= start &&
    a.createdAt.getTime() <= end,
  )
  return candidates.length === 1 ? candidates[0] : null
}
