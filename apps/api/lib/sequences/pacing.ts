/**
 * Sending rhythm shared by send-step (gate) and drip-queue (drainer).
 *
 * Mailbox providers flag bursts of cold email, not volume spread over the day.
 * Each mailbox therefore sends one email at a time with a randomised gap,
 * like a person writing one message after another:
 *
 *   EMAIL_MIN_GAP_SECONDS     minimum gap between two emails of the same
 *                             mailbox (default 20s, 0 disables pacing)
 *   EMAIL_GAP_JITTER_SECONDS  random extra on top of the minimum (default 25s)
 *
 * About 100 emails an hour per mailbox; the daily cap of the mailbox, set by
 * the customer, is what bounds the volume.
 *
 * LinkedIn is paced per workspace (one connected account) with a longer gap:
 * LinkedIn restricts accounts that fire invitations back to back.
 */

export const DEFAULT_EMAIL_MIN_GAP_SECONDS = 20
export const DEFAULT_EMAIL_GAP_JITTER_SECONDS = 25
export const DEFAULT_LINKEDIN_MIN_GAP_SECONDS = 60
const LINKEDIN_GAP_JITTER_SECONDS = 60
const MAX_GAP_SECONDS = 3600

/**
 * A PENDING row younger than this may belong to a send that is running right
 * now in another worker; the drainer leaves it alone.
 */
export const EMAIL_IN_FLIGHT_SEC = 10

function envSeconds(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw) || raw < 0) return fallback
  return Math.min(raw, MAX_GAP_SECONDS)
}

export function emailMinGapSeconds(): number {
  return envSeconds('EMAIL_MIN_GAP_SECONDS', DEFAULT_EMAIL_MIN_GAP_SECONDS)
}

/** Gap to respect before this email, drawn in [min, min + jitter]. */
export function emailGapSeconds(random: () => number = Math.random): number {
  const min = emailMinGapSeconds()
  if (min === 0) return 0
  return min + random() * envSeconds('EMAIL_GAP_JITTER_SECONDS', DEFAULT_EMAIL_GAP_JITTER_SECONDS)
}

/** Gap to respect before this LinkedIn action, drawn in [min, min + 60s]. */
export function linkedInGapSeconds(random: () => number = Math.random): number {
  const min = envSeconds('LINKEDIN_MIN_GAP_SECONDS', DEFAULT_LINKEDIN_MIN_GAP_SECONDS)
  if (min === 0) return 0
  return min + random() * LINKEDIN_GAP_JITTER_SECONDS
}

/** Average email throughput of one mailbox, for the ETA shown to the customer. */
export function averageEmailGapSeconds(): number {
  const min = emailMinGapSeconds()
  if (min === 0) return 0
  return min + envSeconds('EMAIL_GAP_JITTER_SECONDS', DEFAULT_EMAIL_GAP_JITTER_SECONDS) / 2
}
