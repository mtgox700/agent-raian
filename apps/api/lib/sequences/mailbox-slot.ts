/**
 * Per-mailbox pacing slot and provider pause.
 *
 * claimMailboxSlot is a single conditional UPDATE: Postgres re-checks the
 * condition under the row lock, so when several workers try to send from the
 * same mailbox at once exactly one wins and the others keep their email
 * queued. This is what makes "one email at a time per mailbox" hold even with
 * parallel crons, launch kicks and retries.
 */

import type { PrismaClient } from '@prisma/client'
import type { ThrottleVerdict } from '@/lib/email/provider-throttle'

export interface MailboxSlotDb {
  connectedMailbox: Pick<PrismaClient['connectedMailbox'], 'updateMany' | 'update'>
}

export async function claimMailboxSlot(
  db: MailboxSlotDb,
  mailboxId: string,
  gapSeconds: number,
  now: Date = new Date(),
): Promise<boolean> {
  const before = new Date(now.getTime() - gapSeconds * 1000)
  const claimed = await db.connectedMailbox.updateMany({
    where: { id: mailboxId, OR: [{ lastSendAt: null }, { lastSendAt: { lte: before } }] },
    data:  { lastSendAt: now },
  })
  return claimed.count === 1
}

export async function pauseMailbox(
  db: MailboxSlotDb,
  mailboxId: string,
  verdict: ThrottleVerdict,
  now: Date = new Date(),
): Promise<Date> {
  const until = new Date(now.getTime() + verdict.pauseMs)
  await db.connectedMailbox.update({ where: { id: mailboxId }, data: { sendPausedUntil: until } })
  return until
}
