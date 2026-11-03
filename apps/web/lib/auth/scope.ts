/**
 * Which rows of a workspace a member sees. requireAccess says whether the
 * caller may act; these filters say on what. Every list and every lookup by
 * id goes through them, so another member's row answers « not found ».
 *
 * Board rules (E0 lot 2):
 * - OWNER, ADMIN and VIEWER see the whole workspace (VIEWER writes nothing,
 *   which the permissions already enforce).
 * - A MEMBER sees and edits their own campaigns, the leads of those
 *   campaigns, and the leads not yet in any campaign: that pool is the team's
 *   shared stock, assigning a lead to a campaign is what makes it someone's.
 * - Replies, sends and statistics follow the campaign they belong to.
 * - Mailboxes and channels: a MEMBER uses their own and the ones an admin
 *   shared with the team, and manages only their own.
 * - Notifications: those addressed to the member, those about their
 *   campaigns, and the workspace-wide ones about no campaign nor member.
 */

import type { Prisma } from '@prisma/client'
import type { AccessContext } from './access'
import { seesWholeWorkspace } from './permissions'

export type Scope = Pick<AccessContext, 'workspaceId' | 'userId' | 'role'>

const mine = (s: Scope) => !seesWholeWorkspace(s.role)

export function campaignScope(s: Scope): Prisma.CampaignWhereInput {
  return mine(s) ? { workspaceId: s.workspaceId, ownerUserId: s.userId } : { workspaceId: s.workspaceId }
}

/** Whether a campaign already loaded by id is one the caller sees. */
export function seesCampaign(s: Scope, campaign: { workspaceId: string; ownerUserId: string }): boolean {
  return campaign.workspaceId === s.workspaceId && (!mine(s) || campaign.ownerUserId === s.userId)
}

export function leadScope(s: Scope): Prisma.LeadWhereInput {
  if (!mine(s)) return { workspaceId: s.workspaceId }
  return {
    workspaceId: s.workspaceId,
    OR: [{ campaignId: null }, { campaign: { ownerUserId: s.userId } }],
  }
}

export function replyScope(s: Scope): Prisma.EmailReplyWhereInput {
  return { campaign: campaignScope(s) }
}

export function sendScope(s: Scope): Prisma.EmailSendWhereInput {
  return { campaign: campaignScope(s) }
}

export function touchScope(s: Scope): Prisma.LeadTouchWhereInput {
  return mine(s) ? { workspaceId: s.workspaceId, lead: leadScope(s) } : { workspaceId: s.workspaceId }
}

/** Mailboxes the caller sees: all for whole-workspace roles, else their own and the shared ones. */
export function visibleMailboxScope(s: Scope): Prisma.ConnectedMailboxWhereInput {
  return mine(s) ? { workspaceId: s.workspaceId, ...sendableBy(s.userId) } : { workspaceId: s.workspaceId }
}

/** Mailboxes the caller may change or remove. */
export function ownMailboxScope(s: Scope): Prisma.ConnectedMailboxWhereInput {
  return mine(s) ? { workspaceId: s.workspaceId, ownerUserId: s.userId } : { workspaceId: s.workspaceId }
}

export function visibleChannelScope(s: Scope): Prisma.ConnectedChannelWhereInput {
  return mine(s) ? { workspaceId: s.workspaceId, ...sendableBy(s.userId) } : { workspaceId: s.workspaceId }
}

export function ownChannelScope(s: Scope): Prisma.ConnectedChannelWhereInput {
  return mine(s) ? { workspaceId: s.workspaceId, ownerUserId: s.userId } : { workspaceId: s.workspaceId }
}

/**
 * The senders (mailboxes, channels) a member's campaigns go out from: their
 * own and the ones shared with the team. Whatever the role: seeing a
 * colleague's mailbox never means sending as them.
 */
export function sendableBy(userId: string): { OR: Array<{ ownerUserId: string } | { sharedWithTeam: true }> } {
  return { OR: [{ ownerUserId: userId }, { sharedWithTeam: true }] }
}

type CampaignIds = { campaign: { findMany(args: { where: Prisma.CampaignWhereInput; select: { id: true } }): Promise<Array<{ id: string }>> } }

/**
 * Notifications the caller sees. They carry a campaign id without a relation,
 * so a member's filter needs the ids of their campaigns. A member gets those
 * addressed to them, those of their campaigns, and the workspace-wide ones
 * (no member, no campaign, no lead). One about a lead outside any campaign
 * (an SDR approval on the shared pool) goes to the admins.
 */
export async function notificationScope(db: CampaignIds, s: Scope): Promise<Prisma.NotificationWhereInput> {
  if (!mine(s)) return { workspaceId: s.workspaceId }
  return {
    workspaceId: s.workspaceId,
    OR: [
      ...(await ownNotifications(db, s)),
      { userId: null, campaignId: null, leadId: null },
    ],
  }
}

/**
 * Notifications the caller may mark as read. The read state is one per row,
 * shared by whoever sees it: a member marks only theirs and their campaigns',
 * never the workspace-wide ones the admins also follow; an admin marks the
 * workspace's and their own, never a member's personal ones.
 */
export async function notificationReadScope(db: CampaignIds, s: Scope): Promise<Prisma.NotificationWhereInput> {
  if (!mine(s)) return { workspaceId: s.workspaceId, OR: [{ userId: null }, { userId: s.userId }] }
  return { workspaceId: s.workspaceId, OR: await ownNotifications(db, s) }
}

async function ownNotifications(db: CampaignIds, s: Scope): Promise<Prisma.NotificationWhereInput[]> {
  const own = await db.campaign.findMany({ where: campaignScope(s), select: { id: true } })
  return [
    { userId: s.userId },
    { userId: null, campaignId: { in: own.map((c) => c.id) } },
  ]
}

/**
 * Who a sender (mailbox or channel) may serve: the campaign owner's own, or
 * one shared with the team. Used where a campaign picks or uses its sender.
 */
export function senderServes(sender: { ownerUserId: string; sharedWithTeam: boolean }, campaignOwnerUserId: string): boolean {
  return sender.sharedWithTeam || sender.ownerUserId === campaignOwnerUserId
}
