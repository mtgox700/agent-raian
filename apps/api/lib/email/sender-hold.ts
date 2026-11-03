/**
 * Why a campaign email without a sending mailbox waits instead of leaving
 * from the Phantera shared domain. Used by the send step and by the status
 * shown on the campaign page, so both always agree.
 *
 * - MAILBOX_DISCONNECTED: the campaign's own mailbox, or one serving its
 *   owner that was in use (default, or already sent), is disconnected.
 * - NO_SENDER: the team sends from its own mailboxes, but none serves this
 *   campaign's owner (a member who connected none and has none shared).
 *   A colleague's address must not be replaced by the shared domain quietly.
 * - null: no such mailbox: the shared domain is the sender, as before teams.
 */

import type { PrismaClient } from '@prisma/client'
import { sendableBy } from '@/lib/auth/scope'

export type SenderHold = 'MAILBOX_DISCONNECTED' | 'NO_SENDER'

export async function senderHold(
  db: Pick<PrismaClient, 'connectedMailbox'>,
  campaign: { id: string; workspaceId: string; ownerUserId: string },
): Promise<{ hold: SenderHold; email: string | null } | null> {
  const disconnected = await db.connectedMailbox.findFirst({
    where: {
      OR: [
        { campaigns: { some: { id: campaign.id } } },
        {
          workspaceId: campaign.workspaceId,
          ...sendableBy(campaign.ownerUserId),
          AND: [{ OR: [{ isDefault: true }, { emailSends: { some: {} } }] }],
        },
      ],
    },
    select: { email: true },
  })
  if (disconnected) return { hold: 'MAILBOX_DISCONNECTED', email: disconnected.email }

  // Colleagues' mailboxes, not shared: the team sends from its own
  // addresses. (A workspace whose mailboxes are all its owner's never lands
  // here: theirs serve them, the case above.)
  const colleaguesOnly = await db.connectedMailbox.findFirst({
    where:  { workspaceId: campaign.workspaceId, ownerUserId: { not: campaign.ownerUserId }, sharedWithTeam: false },
    select: { id: true },
  })
  return colleaguesOnly ? { hold: 'NO_SENDER', email: null } : null
}
