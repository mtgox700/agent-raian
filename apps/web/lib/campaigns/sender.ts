/**
 * Changing a campaign's sender: one path for the campaign page and for an
 * alert's one-click action. Takes effect from the next email; those already
 * sent keep their sender, and replies keep reaching the mailbox that sent
 * them. The caller has already checked the permission (campaign.write).
 */

import type { PrismaClient } from '@prisma/client'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { recordAudit } from '@/lib/audit/audit'
import { validateSenderChoice } from '@/lib/email/mailbox-access'
import type { ChangeOrigin } from './status'

export interface SenderInput { mailboxId: string | null; fromAlias: string | null }

export type SenderChange =
  | { ok: true; mailboxId: string | null; fromAlias: string | null; previous: string | null }
  | { ok: false; status: number; error: string }

export async function changeCampaignSender(db: PrismaClient, scope: Scope, campaignId: string, input: SenderInput, origin: ChangeOrigin = {}): Promise<SenderChange> {
  const campaign = await db.campaign.findFirst({
    where:  { id: campaignId, ...campaignScope(scope) },
    select: { id: true, workspaceId: true, ownerUserId: true, connectedMailboxId: true },
  })
  if (!campaign) return { ok: false, status: 404, error: 'Campagne introuvable.' }

  // Among the mailboxes serving the campaign's owner, whoever edits it.
  const choice = await validateSenderChoice(db, { workspaceId: campaign.workspaceId, ownerUserId: campaign.ownerUserId }, input)
  if (!choice.ok) return { ok: false, status: 422, error: choice.error }

  await db.campaign.updateMany({
    where: { id: campaign.id, workspaceId: campaign.workspaceId },
    // An explicit choice, even the default mailbox, settles a removed sender.
    data:  { connectedMailboxId: choice.mailboxId, fromAlias: choice.fromAlias, senderLostAt: null },
  })
  await recordAudit(db, scope, {
    action: 'sender.changed', target: { type: 'campaign', id: campaign.id }, req: origin.req,
    details: { from: campaign.connectedMailboxId, to: choice.mailboxId, alias: choice.fromAlias, ...(origin.insightId ? { via: 'alerte', insightId: origin.insightId } : {}) },
  })
  return { ok: true, mailboxId: choice.mailboxId, fromAlias: choice.fromAlias, previous: campaign.connectedMailboxId }
}
