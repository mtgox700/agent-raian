/**
 * Pausing, resuming and completing a campaign: one path for the campaign
 * page and for the one-click actions of an alert (lib/insights/actions), so
 * both check the same things and both leave a trace in the audit log.
 *
 * Valid transitions: ACTIVE -> PAUSED, PAUSED -> ACTIVE, ACTIVE|PAUSED -> COMPLETED.
 * The caller has already checked the permission (campaign.launch).
 */

import type { PrismaClient } from '@prisma/client'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { recordAudit } from '@/lib/audit/audit'
import { DELETION_PENDING_MESSAGE, deletionPending } from '@/lib/privacy/workspace-deletion'
import { SENDER_REQUIRED_MESSAGE } from '@/lib/email/mailbox-access'
import { canActivateCampaign } from '@/lib/stripe/quota'

export type StatusAction = 'pause' | 'resume' | 'complete'
type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED'

const TRANSITIONS: Record<StatusAction, Partial<Record<string, CampaignStatus>>> = {
  pause:    { ACTIVE: 'PAUSED' },
  resume:   { PAUSED: 'ACTIVE' },
  complete: { ACTIVE: 'COMPLETED', PAUSED: 'COMPLETED' },
}

const AUDIT = { pause: 'campaign.paused', resume: 'campaign.resumed', complete: 'campaign.completed' } as const

export type StatusChange =
  | { ok: true; campaign: { id: string; status: string; completedAt: Date | null } }
  | { ok: false; status: number; error: string; reason?: string }

/** Where the change came from, for the audit log: the campaign page, or an alert's action. */
export interface ChangeOrigin { req?: Request; insightId?: string }

export async function changeCampaignStatus(db: PrismaClient, scope: Scope, campaignId: string, action: StatusAction, origin: ChangeOrigin = {}): Promise<StatusChange> {
  const campaign = await db.campaign.findFirst({
    where:  { id: campaignId, ...campaignScope(scope) },
    select: { id: true, status: true, senderLostAt: true },
  })
  if (!campaign) return { ok: false, status: 404, error: 'Campagne introuvable' }
  if (action === 'resume' && campaign.senderLostAt) {
    return { ok: false, status: 409, error: SENDER_REQUIRED_MESSAGE, reason: 'sender_required' }
  }

  const next = TRANSITIONS[action][campaign.status]
  if (!next) return { ok: false, status: 409, error: `Transition invalide : de ${campaign.status} vers ${action}` }
  if (next === 'ACTIVE' && await deletionPending(db, scope.workspaceId)) {
    return { ok: false, status: 409, error: DELETION_PENDING_MESSAGE, reason: 'deletion_pending' }
  }
  if (action === 'resume') {
    const quota = await canActivateCampaign(scope.workspaceId, campaignId)
    if (!quota.allowed) {
      return {
        ok: false, status: 402, reason: 'campaign_limit',
        error: `Votre formule ${quota.planName} permet ${quota.limit} campagne${quota.limit > 1 ? 's' : ''} active${quota.limit > 1 ? 's' : ''} à la fois. Mettez-en une en pause ou changez de formule.`,
      }
    }
  }

  // Completing a campaign also empties its queue: the detail page kept
  // showing "X en attente" for messages that would never leave.
  const [updated] = await db.$transaction([
    db.campaign.update({
      where:  { id: campaignId },
      data:   { status: next, completedAt: next === 'COMPLETED' ? new Date() : undefined },
      select: { id: true, status: true, completedAt: true },
    }),
    ...(next === 'COMPLETED' ? [db.emailSend.deleteMany({ where: { campaignId, status: 'PENDING' } })] : []),
  ])
  await recordAudit(db, scope, {
    action: AUDIT[action], target: { type: 'campaign', id: campaignId }, req: origin.req,
    details: { from: campaign.status, to: next, ...(origin.insightId ? { via: 'alerte', insightId: origin.insightId } : {}) },
  })
  return { ok: true, campaign: updated }
}
