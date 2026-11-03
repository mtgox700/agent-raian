/**
 * Deleting a workspace (RGPD art. 17), with 30 days to change one's mind.
 *
 * Scheduled by its owner (after a recent verification and typing its name):
 *   - every running campaign is paused and none can start again;
 *   - the Stripe subscription is set to end at the close of its period;
 *   - the workspace stays readable, so the team can export or cancel.
 * Cancelled within the 30 days: the date is cleared and the subscription
 * renews again. Campaigns stay paused: restarting them is a deliberate act.
 *
 * Purged by the daily housekeeping once the date has passed:
 *   1. the subscription is cancelled at once (refused -> nothing is deleted,
 *      the purge retries the next day);
 *   2. LinkedIn accounts are revoked at Unipile (best effort);
 *   3. in one transaction: the workspace and everything that cascades from
 *      it (campaigns, leads, sends, replies, mailboxes and their tokens,
 *      channels, members, invitations, notifications), the tables that hold
 *      its id without a foreign key (exports, phone reveals, its objection
 *      fingerprints), and its audit trail, which the database lets go only
 *      inside this transaction (phantera.erase_workspace);
 *   4. a tombstone without personal data proves the deletion for 13 months.
 * Member accounts stay: they may belong to other workspaces.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { recordAudit } from '@/lib/audit/audit'

export const DELETION_GRACE_DAYS = 30

export const DELETION_PENDING_BILLING = 'La suppression de cet espace est programmée : l’abonnement ne peut pas être modifié. Annulez d’abord la suppression dans Paramètres › Sécurité.'

export const DELETION_PENDING_MESSAGE = 'La suppression de cet espace est programmée : aucune campagne ne peut repartir. Annulez la suppression dans Paramètres › Sécurité pour reprendre.'
const DAY_MS = 24 * 60 * 60 * 1000

export interface BillingApi {
  subscriptions: {
    update(id: string, params: { cancel_at_period_end: boolean }): Promise<unknown>
    cancel(id: string): Promise<unknown>
  }
}

export type DeletionError = 'NAME_MISMATCH' | 'ALREADY_SCHEDULED' | 'NOT_SCHEDULED' | 'NOT_FOUND' | 'TOO_LATE'

function alreadyGone(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number; message?: string }
  return e?.code === 'resource_missing' || e?.statusCode === 404 || /already (been )?cancel/i.test(e?.message ?? '')
}

/** True while the workspace is waiting for its purge: nothing may start sending. */
export async function deletionPending(db: Pick<PrismaClient, 'workspace'>, workspaceId: string): Promise<boolean> {
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { deletionScheduledFor: true } })
  return Boolean(w?.deletionScheduledFor)
}

export async function scheduleWorkspaceDeletion(
  db: PrismaClient,
  billing: BillingApi,
  input: { workspaceId: string; userId: string; confirmName: string; req?: Request | null; now?: Date },
): Promise<{ ok: true; scheduledFor: Date; pausedCampaigns: number } | { ok: false; error: DeletionError }> {
  const now = input.now ?? new Date()
  const workspace = await db.workspace.findUnique({
    where:  { id: input.workspaceId },
    select: { name: true, deletionScheduledFor: true, stripeSubscriptionId: true },
  })
  if (!workspace) return { ok: false, error: 'NOT_FOUND' }
  if (workspace.deletionScheduledFor) return { ok: false, error: 'ALREADY_SCHEDULED' }
  if (input.confirmName.trim() !== workspace.name.trim()) return { ok: false, error: 'NAME_MISMATCH' }

  // Billing first: if Stripe refuses, nothing has changed yet.
  if (workspace.stripeSubscriptionId) {
    await billing.subscriptions.update(workspace.stripeSubscriptionId, { cancel_at_period_end: true }).catch((err: unknown) => {
      if (!alreadyGone(err)) throw err
    })
  }

  const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS)
  const pausedCampaigns = await db.$transaction(async (tx) => {
    // Conditional: two requests at once schedule it once, never push the date.
    const claimed = await tx.workspace.updateMany({
      where: { id: input.workspaceId, deletionScheduledFor: null },
      data:  { deletionRequestedAt: now, deletionScheduledFor: scheduledFor, deletionRequestedById: input.userId },
    })
    if (claimed.count === 0) return null
    return (await tx.campaign.updateMany({ where: { workspaceId: input.workspaceId, status: 'ACTIVE' }, data: { status: 'PAUSED' } })).count
  })
  if (pausedCampaigns === null) return { ok: false, error: 'ALREADY_SCHEDULED' }

  await recordAudit(db, { workspaceId: input.workspaceId, userId: input.userId }, {
    action: 'data.deletion_scheduled', target: { type: 'workspace', id: input.workspaceId }, req: input.req,
    details: { scheduledFor: scheduledFor.toISOString(), pausedCampaigns },
  })
  return { ok: true, scheduledFor, pausedCampaigns }
}

export async function cancelWorkspaceDeletion(
  db: PrismaClient,
  billing: BillingApi,
  input: { workspaceId: string; userId: string; req?: Request | null; now?: Date },
): Promise<{ ok: true } | { ok: false; error: DeletionError }> {
  const now = input.now ?? new Date()
  const workspace = await db.workspace.findUnique({
    where:  { id: input.workspaceId },
    select: { deletionScheduledFor: true, stripeSubscriptionId: true },
  })
  if (!workspace) return { ok: false, error: 'NOT_FOUND' }
  if (!workspace.deletionScheduledFor) return { ok: false, error: 'NOT_SCHEDULED' }
  // Once the date has passed the purge owns the workspace: cancelling and
  // purging can never run on the same workspace at once.
  if (workspace.deletionScheduledFor <= now) return { ok: false, error: 'TOO_LATE' }

  if (workspace.stripeSubscriptionId) {
    await billing.subscriptions.update(workspace.stripeSubscriptionId, { cancel_at_period_end: false }).catch((err: unknown) => {
      // A subscription that already ended stays ended: the owner subscribes again.
      if (!alreadyGone(err)) throw err
    })
  }
  const cleared = await db.workspace.updateMany({
    where: { id: input.workspaceId, deletionScheduledFor: { gt: now } },
    data:  { deletionRequestedAt: null, deletionScheduledFor: null, deletionRequestedById: null },
  })
  if (cleared.count === 0) return { ok: false, error: 'TOO_LATE' }
  await recordAudit(db, { workspaceId: input.workspaceId, userId: input.userId }, {
    action: 'data.deletion_cancelled', target: { type: 'workspace', id: input.workspaceId }, req: input.req,
  })
  return { ok: true }
}

type Tx = Prisma.TransactionClient

/** Everything of the workspace, in one transaction. The tombstone is written last. */
async function eraseWorkspace(tx: Tx, workspaceId: string, now: Date): Promise<void> {
  // Still due, checked inside the transaction that deletes.
  const due = await tx.workspace.count({ where: { id: workspaceId, deletionScheduledFor: { lte: now } } })
  if (due === 0) throw new Error('workspace no longer due for deletion')
  // Rows that hold the workspace id without a foreign key.
  await tx.workspaceExport.deleteMany({ where: { workspaceId } })
  await tx.phoneReveal.deleteMany({ where: { workspaceId } })
  await tx.optOut.deleteMany({ where: { scope: workspaceId } })
  // The audit trail is append only; the trigger lets it go for this
  // workspace only, inside this transaction.
  await tx.$executeRaw`SELECT set_config('phantera.erase_workspace', ${workspaceId}, true)`
  await tx.auditEvent.deleteMany({ where: { workspaceId } })
  // Cascades: campaigns, steps, leads, sends, replies, touches, enrichments,
  // mailboxes (tokens), channels, members, invitations, notifications.
  await tx.workspace.delete({ where: { id: workspaceId } })
  await tx.auditEvent.create({
    data: {
      workspaceId, actorUserId: null, actorLabel: 'Système', action: 'data.deleted',
      targetType: 'workspace', targetId: workspaceId, details: { erasedAt: now.toISOString() },
    },
  })
}

export interface PurgeDeps {
  billing: BillingApi
  /** Revokes a LinkedIn account at Unipile. */
  revokeChannel(accountId: string): Promise<unknown>
  /** Revokes a mailbox's OAuth grant at its provider (best effort). */
  revokeMailbox?(mailbox: { provider: string; refreshTokenEnc: string | null; accessTokenEnc: string }): Promise<unknown>
}

/** Purges one workspace whose grace period is over. */
export async function purgeWorkspace(db: PrismaClient, deps: PurgeDeps, workspaceId: string, now = new Date()): Promise<boolean> {
  const workspace = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: {
      deletionScheduledFor: true, stripeSubscriptionId: true,
      connectedChannels:  { select: { unipileAccountId: true } },
      connectedMailboxes: { select: { provider: true, refreshTokenEnc: true, accessTokenEnc: true } },
    },
  })
  // Cancelled meanwhile, or not due yet: never purge.
  if (!workspace?.deletionScheduledFor || workspace.deletionScheduledFor > now) return false

  if (workspace.stripeSubscriptionId) {
    await deps.billing.subscriptions.cancel(workspace.stripeSubscriptionId).catch((err: unknown) => {
      if (!alreadyGone(err)) throw err
    })
  }
  for (const { unipileAccountId } of workspace.connectedChannels) {
    if (!unipileAccountId) continue
    await deps.revokeChannel(unipileAccountId).catch((err: unknown) => {
      console.warn('[workspace-deletion] unipile revoke failed:', err instanceof Error ? err.message : String(err))
    })
  }
  // The mailboxes' grants at Google: the tokens are deleted below, but a
  // refresh token stays valid at the provider until revoked.
  if (deps.revokeMailbox) {
    for (const mailbox of workspace.connectedMailboxes) {
      await deps.revokeMailbox(mailbox).catch((err: unknown) => {
        console.warn('[workspace-deletion] mailbox revoke failed:', err instanceof Error ? err.message : String(err))
      })
    }
  }
  await db.$transaction((tx) => eraseWorkspace(tx, workspaceId, now))
  return true
}

/** The daily purge: every workspace past its 30 days. One failure does not stop the others. */
export async function purgeDueWorkspaces(db: PrismaClient, deps: PurgeDeps, now = new Date()): Promise<number> {
  const due = await db.workspace.findMany({ where: { deletionScheduledFor: { lte: now } }, select: { id: true }, take: 50 })
  let purged = 0
  for (const { id } of due) {
    try {
      if (await purgeWorkspace(db, deps, id, now)) purged++
    } catch (err) {
      console.error(`[workspace-deletion] purge of ${id} failed, retried tomorrow:`, err instanceof Error ? err.message : String(err))
    }
  }
  return purged
}
