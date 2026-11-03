/**
 * Opens and clicks on a send, whatever order they arrive in (pixel, Resend
 * webhook, retries). A status only moves forward: an open never turns a
 * CLICKED back into OPENED, and neither revives a send that bounced or
 * failed (it used to: `openedAt: null` was the only guard).
 */

import type { PrismaClient } from '@prisma/client'

type Db = Pick<PrismaClient, 'emailSend'>

/** Sends that reached the recipient: the only ones an open or a click can concern. */
const DELIVERED_STATUSES = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] as const

/** Records the first open. True when it was the first one (to count it once). */
export async function recordOpen(db: Db, emailSendId: string, at = new Date()): Promise<boolean> {
  const first = await db.emailSend.updateMany({
    where: { id: emailSendId, openedAt: null, status: { in: [...DELIVERED_STATUSES] } },
    data:  { openedAt: at },
  })
  // Moves forward only from SENT or DELIVERED: CLICKED stays CLICKED.
  await db.emailSend.updateMany({
    where: { id: emailSendId, status: { in: ['SENT', 'DELIVERED'] } },
    data:  { status: 'OPENED' },
  })
  return first.count > 0
}

/** Records a click (a click implies the email was opened). */
export async function recordClick(db: Db, emailSendId: string, at = new Date()): Promise<void> {
  await db.emailSend.updateMany({
    where: { id: emailSendId, status: { in: [...DELIVERED_STATUSES] } },
    data:  { status: 'CLICKED', clickedAt: at },
  })
  await db.emailSend.updateMany({
    where: { id: emailSendId, openedAt: null, status: 'CLICKED' },
    data:  { openedAt: at },
  })
}
