/**
 * What happens to a member's campaigns, mailboxes and channels when they
 * leave a workspace. Nothing restarts under another person's identity
 * without a decision:
 * - with a transfer to an admin chosen by the team, everything (campaigns,
 *   mailboxes, channels) goes to that admin as it is: the team decided;
 * - without one, their campaigns go to the workspace owner, active ones
 *   paused; their mailboxes and channels are their own accounts: removed,
 *   and the campaigns that sent from them lose their sender (to choose
 *   again), exactly as when a mailbox is disconnected.
 *
 * Every function runs on the client it is given: callers pass a transaction.
 */

import type { PrismaClient } from '@prisma/client'

type Db = Pick<PrismaClient, 'campaign' | 'connectedMailbox' | 'connectedChannel'>

export interface HandOverResult {
  pausedCampaigns: number
  transferredCampaigns: number
  removedMailboxes: number
  /** Unipile accounts of the removed channels, to revoke after the commit. */
  channelAccounts: string[]
}

/** Without a chosen successor: campaigns to `toUserId` paused, accounts removed. */
export async function handOverMemberResources(
  db: Db,
  input: { workspaceId: string; fromUserId: string; toUserId: string },
): Promise<HandOverResult> {
  const { workspaceId, fromUserId, toUserId } = input
  const [mailboxes, channels] = await Promise.all([
    db.connectedMailbox.findMany({ where: { workspaceId, ownerUserId: fromUserId }, select: { id: true } }),
    db.connectedChannel.findMany({ where: { workspaceId, ownerUserId: fromUserId }, select: { id: true, unipileAccountId: true } }),
  ])
  const mailboxIds = mailboxes.map((m) => m.id)
  const usingTheirMailbox = { workspaceId, connectedMailboxId: { in: mailboxIds } }

  const lostSenderPaused = await db.campaign.updateMany({ where: { ...usingTheirMailbox, status: 'ACTIVE' }, data: { status: 'PAUSED' } })
  await db.campaign.updateMany({ where: usingTheirMailbox, data: { connectedMailboxId: null, fromAlias: null, senderLostAt: new Date() } })
  const ownPaused = await db.campaign.updateMany({ where: { workspaceId, ownerUserId: fromUserId, status: 'ACTIVE' }, data: { status: 'PAUSED' } })
  const transferred = await db.campaign.updateMany({ where: { workspaceId, ownerUserId: fromUserId }, data: { ownerUserId: toUserId } })
  const removed = await db.connectedMailbox.deleteMany({ where: { id: { in: mailboxIds }, workspaceId } })
  await db.connectedChannel.deleteMany({ where: { workspaceId, ownerUserId: fromUserId } })

  return {
    pausedCampaigns:      lostSenderPaused.count + ownPaused.count,
    transferredCampaigns: transferred.count,
    removedMailboxes:     removed.count,
    channelAccounts:      channels.map((c) => c.unipileAccountId).filter((id): id is string => Boolean(id)),
  }
}

/**
 * With a successor chosen by the team: campaigns, mailboxes and channels go
 * to them unchanged. Their mailboxes stop being anyone's default, so the
 * successor's own default keeps serving their campaigns.
 */
export async function transferMemberResources(
  db: Db,
  input: { workspaceId: string; fromUserId: string; toUserId: string },
): Promise<{ transferredCampaigns: number; transferredMailboxes: number }> {
  const { workspaceId, fromUserId, toUserId } = input
  const campaigns = await db.campaign.updateMany({ where: { workspaceId, ownerUserId: fromUserId }, data: { ownerUserId: toUserId } })
  const mailboxes = await db.connectedMailbox.updateMany({ where: { workspaceId, ownerUserId: fromUserId }, data: { ownerUserId: toUserId, isDefault: false } })
  await db.connectedChannel.updateMany({ where: { workspaceId, ownerUserId: fromUserId }, data: { ownerUserId: toUserId } })
  return { transferredCampaigns: campaigns.count, transferredMailboxes: mailboxes.count }
}

type AccountDb = Db & Pick<PrismaClient, 'user' | 'workspace' | 'workspaceMember' | '$executeRaw'>

const SUCCESSION: Array<'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'> = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']

/**
 * Before deleting an account. A workspace it is the billing owner of, with
 * anyone else in the team, goes to the next in line (oldest owner, else
 * oldest admin, else oldest member), promoted OWNER if needed: deleting
 * one's account never destroys the team's work. Then, in every workspace it
 * does not own, its resources go to that workspace's owner. A workspace it
 * alone belongs to is deleted with it. Runs under each team's lock.
 */
export async function handOverBeforeAccountDeletion(db: AccountDb, clerkId: string): Promise<HandOverResult[]> {
  const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } })
  if (!user) return []

  const owned = await db.workspace.findMany({ where: { ownerId: user.id }, select: { id: true } })
  for (const { id } of owned) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team:${id}`}))`
    const successor = await nextInLine(db, id, user.id)
    if (!successor) continue
    if (successor.role !== 'OWNER') await db.workspaceMember.update({ where: { id: successor.id }, data: { role: 'OWNER' } })
    await db.workspace.update({ where: { id }, data: { ownerId: successor.userId } })
  }

  const notOwned = { ownerUserId: user.id, workspace: { ownerId: { not: user.id } } }
  const [campaigns, mailboxes, channels] = await Promise.all([
    db.campaign.findMany({ where: notOwned, select: { workspaceId: true, workspace: { select: { ownerId: true } } } }),
    db.connectedMailbox.findMany({ where: notOwned, select: { workspaceId: true, workspace: { select: { ownerId: true } } } }),
    db.connectedChannel.findMany({ where: notOwned, select: { workspaceId: true, workspace: { select: { ownerId: true } } } }),
  ])
  const owners = new Map([...campaigns, ...mailboxes, ...channels].map((r) => [r.workspaceId, r.workspace.ownerId]))
  const results: HandOverResult[] = []
  for (const [workspaceId, ownerId] of owners) {
    results.push(await handOverMemberResources(db, { workspaceId, fromUserId: user.id, toUserId: ownerId }))
  }
  return results
}

async function nextInLine(db: AccountDb, workspaceId: string, leavingUserId: string) {
  for (const role of SUCCESSION) {
    const found = await db.workspaceMember.findFirst({
      where:   { workspaceId, role, userId: { not: leavingUserId } },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, userId: true, role: true },
    })
    if (found) return found
  }
  return null
}
