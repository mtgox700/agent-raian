/**
 * Inngest: the sending queue worker (see lib/sequences/drip-queue).
 *
 * Runs right away when messages are queued (kick event) and every 5 minutes
 * as a fallback. A run makes passes ~10 seconds apart for as long as messages
 * wait their turn (up to DRIP_MAX_PASSES, about 9 minutes), and stops after a
 * single pass when the queue is empty. Singleton: a kick or cron arriving
 * while a run is active is skipped, the active run already drains new rows.
 *
 * Why not every minute: each wake-up starts a function on Vercel. 1 440 idle
 * wake-ups a day used the Hobby plan's whole CPU allowance on their own and
 * got the account blocked (2026-10-26). A busy run outlasts the 5-minute cron,
 * so a live campaign keeps its rhythm: the next run starts at most a minute
 * after the previous one ends.
 */

import { inngest, EMAIL_DRIP_KICK_EVENT } from './client'
import { db } from '@/lib/db'
import { drainQueuedSends, type DripResult } from '@/lib/sequences/drip-queue'

export const DRIP_MAX_PASSES = 54
const TICK_GAP = '10s'

interface DripStep {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>
  sleep(id: string, duration: string): Promise<void>
}

export async function emailDripHandler({ step }: { step: DripStep }): Promise<DripResult> {
  const total: DripResult = { picked: 0, sent: 0, skipped: 0, errors: 0, holds: {} }
  for (let tick = 0; tick < DRIP_MAX_PASSES; tick++) {
    if (tick > 0) await step.sleep(`gap-${tick}`, TICK_GAP)
    const r = await step.run(`drain-${tick}`, () => drainQueuedSends(db))
    total.picked += r.picked
    total.sent += r.sent
    total.skipped += r.skipped
    total.errors += r.errors
    for (const [reason, n] of Object.entries(r.holds ?? {})) total.holds[reason] = (total.holds[reason] ?? 0) + n
    if (r.picked === 0) break
  }
  // One line per run: a queue held by a cap, a quota or a pause used to be
  // invisible in the logs. PACED is the normal rhythm, not worth a line.
  const notable = Object.keys(total.holds).filter((reason) => reason !== 'PACED')
  if (notable.length > 0) {
    console.info(`[email-drip] queue held: ${JSON.stringify(total.holds)} (sent=${total.sent}, errors=${total.errors})`)
  }
  return total
}

export const emailDrip = inngest.createFunction(
  {
    id: 'email-drip',
    name: 'Sending queue (paced per mailbox)',
    retries: 0, // the next run is at most 5 minutes away; sends are idempotent
    singleton: { mode: 'skip' },
    triggers: [{ cron: '*/5 * * * *' }, { event: EMAIL_DRIP_KICK_EVENT }],
  },
  async ({ step }) => emailDripHandler({ step: step as unknown as DripStep }),
)

/** Start sending now instead of waiting for the next minute. Never throws. */
export async function kickEmailDrip(reason: string): Promise<void> {
  await inngest.send({ name: EMAIL_DRIP_KICK_EVENT, data: { reason } }).catch((err: unknown) => {
    console.warn(`[email-drip] kick failed (${reason}), the cron takes over within 5 minutes:`, err instanceof Error ? err.message : String(err))
  })
}
