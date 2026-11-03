/**
 * The actions of the opportunity alerts (lib/insights/detect-opportunities),
 * each with its undo. Called by lib/insights/act once the alert, the action
 * and the role are checked.
 *
 *   skip_segment  the segment's first messages still PENDING become SKIPPED:
 *                 not sent, and with no first message sent no follow-up is
 *                 ever created for those leads. Undo puts them back PENDING.
 *   duplicate     a DRAFT copy (messages, sender if allowed, targeting to
 *                 change), no leads, nothing sent. Undo deletes it while it is
 *                 still an untouched draft.
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import { DIMENSIONS } from '@/lib/analyst/facts/campaign'
import { recordAudit } from '@/lib/audit/audit'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { validateSenderChoice } from '@/lib/email/mailbox-access'
import { checkCampaignQuota } from '@/lib/stripe/quota'
import type { ChangeOrigin } from '@/lib/campaigns/status'
import { parseSegmentKey } from './detect-opportunities'

type Outcome = { ok: true; before: Prisma.InputJsonObject } | { ok: false; status: number; error: string }

export async function skipSegment(db: PrismaClient, scope: Scope, insight: { key: string; campaignId: string }, origin: ChangeOrigin): Promise<Outcome> {
  const seg = parseSegmentKey(insight.key)
  if (!seg || seg.campaignId !== insight.campaignId) return { ok: false, status: 409, error: 'Segment introuvable.' }
  const campaign = await db.campaign.findFirst({ where: { id: insight.campaignId, ...campaignScope(scope) }, select: { id: true } })
  if (!campaign) return { ok: false, status: 404, error: 'Campagne introuvable.' }

  const expr = Prisma.raw(DIMENSIONS[seg.dimension])
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT s."id" FROM "EmailSend" s
    JOIN "CampaignEmailStep" st ON st."id" = s."emailStepId"
    JOIN "Lead" l ON l."id" = s."leadId"
    WHERE s."campaignId" = ${campaign.id} AND s."status"::text = 'PENDING' AND ${expr} = ${seg.value}
      AND st."position" = (SELECT min(x."position") FROM "CampaignEmailStep" x WHERE x."campaignId" = ${campaign.id})`
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return { ok: false, status: 409, error: 'Plus aucun premier message de ce segment n’attend : rien à retirer.' }
  // Still PENDING at the moment of writing: one being sent is left alone.
  const done = await db.emailSend.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'SKIPPED' } })
  await recordAudit(db, scope, {
    action: 'campaign.segment_skipped', target: { type: 'campaign', id: campaign.id }, req: origin.req,
    details: { dimension: seg.dimension, value: seg.value, count: done.count, via: 'alerte', insightId: origin.insightId ?? null },
  })
  return { ok: true, before: { sendIds: ids, dimension: seg.dimension, value: seg.value, count: done.count } }
}

export async function restoreSegment(db: PrismaClient, scope: Scope, campaignId: string, before: { sendIds?: string[]; dimension?: string; value?: string }, origin: ChangeOrigin): Promise<Outcome> {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, ...campaignScope(scope) }, select: { id: true } })
  if (!campaign) return { ok: false, status: 404, error: 'Campagne introuvable.' }
  // Only what this action took off, and only if still skipped.
  const back = await db.emailSend.updateMany({ where: { id: { in: before.sendIds ?? [] }, campaignId, status: 'SKIPPED' }, data: { status: 'PENDING' } })
  await recordAudit(db, scope, {
    action: 'campaign.segment_restored', target: { type: 'campaign', id: campaignId }, req: origin.req,
    details: { dimension: before.dimension ?? null, value: before.value ?? null, count: back.count, via: 'alerte', insightId: origin.insightId ?? null },
  })
  return { ok: true, before: {} }
}

const COPY_SUFFIX = ' (copie)'
const NAME_MAX = 120

export async function duplicateCampaign(db: PrismaClient, scope: Scope, campaignId: string, origin: ChangeOrigin): Promise<Outcome> {
  const source = await db.campaign.findFirst({
    where: { id: campaignId, ...campaignScope(scope) },
    include: { emailSteps: { orderBy: { position: 'asc' } } },
  })
  if (!source) return { ok: false, status: 404, error: 'Campagne introuvable.' }
  const quota = await checkCampaignQuota(scope.workspaceId)
  if (!quota.allowed) {
    return { ok: false, status: 402, error: `Votre formule ${quota.planName} permet ${quota.limit} campagne${quota.limit > 1 ? 's' : ''}, brouillons compris. Supprimez-en une ou changez de formule.` }
  }
  // The copy belongs to who makes it: its sender must be one they may use, else the default mailbox.
  const sender = await validateSenderChoice(db, { workspaceId: scope.workspaceId, ownerUserId: scope.userId }, { mailboxId: source.connectedMailboxId, fromAlias: source.fromAlias })
  const copy = await db.campaign.create({
    data: {
      workspaceId: scope.workspaceId, ownerUserId: scope.userId, status: 'DRAFT',
      name: `${source.name.slice(0, NAME_MAX - COPY_SUFFIX.length)}${COPY_SUFFIX}`,
      goal: source.goal, tone: source.tone, valueProposition: source.valueProposition, aiModel: source.aiModel, leadSource: source.leadSource,
      targetIndustry: source.targetIndustry, targetTitles: source.targetTitles, targetCompanySizes: source.targetCompanySizes,
      targetGeos: source.targetGeos, excludedDomains: source.excludedDomains,
      connectedMailboxId: sender.ok ? sender.mailboxId : null, fromAlias: sender.ok ? sender.fromAlias : null,
      emailSteps: {
        create: source.emailSteps.map((s) => ({
          position: s.position, dayOffset: s.dayOffset, channel: s.channel, subject: s.subject, body: s.body,
          inviteNote: s.inviteNote, isAiGenerated: s.isAiGenerated, aiScore: s.aiScore, aiCritiqueNotes: s.aiCritiqueNotes,
        })),
      },
    },
    select: { id: true },
  })
  await recordAudit(db, scope, {
    action: 'campaign.duplicated', target: { type: 'campaign', id: copy.id }, req: origin.req,
    details: { from: source.id, senderKept: sender.ok, via: 'alerte', insightId: origin.insightId ?? null },
  })
  return { ok: true, before: { draftId: copy.id } }
}

export async function deleteDraftCopy(db: PrismaClient, scope: Scope, draftId: string, origin: ChangeOrigin): Promise<Outcome> {
  const draft = await db.campaign.findFirst({
    where: { id: draftId, ...campaignScope(scope) },
    select: { id: true, status: true, _count: { select: { leads: true, emailSends: true } } },
  })
  if (!draft) return { ok: true, before: {} } // already gone: nothing to undo
  if (draft.status !== 'DRAFT' || draft._count.leads > 0 || draft._count.emailSends > 0) {
    return { ok: false, status: 409, error: 'La copie a déjà des leads ou a été lancée : supprimez-la depuis sa page si vous le souhaitez.' }
  }
  await db.campaign.delete({ where: { id: draft.id } })
  await recordAudit(db, scope, { action: 'campaign.draft_deleted', target: { type: 'campaign', id: draft.id }, req: origin.req, details: { via: 'alerte', insightId: origin.insightId ?? null } })
  return { ok: true, before: {} }
}
