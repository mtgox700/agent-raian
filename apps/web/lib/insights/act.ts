/**
 * Taking an alert's action, and undoing it. The person has confirmed in the
 * interface; here the server checks that the alert is theirs to see, that it
 * offers this action, and that their role allows it. The change goes through
 * the same services as the campaign page (lib/campaigns/status, sender),
 * which leave the audit trace; the action is kept to be undone and followed.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { can } from '@/lib/auth/permissions'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { changeCampaignStatus } from '@/lib/campaigns/status'
import { changeCampaignSender, type SenderInput } from '@/lib/campaigns/sender'
import { ACTIONS, isActionKind, type ActionKind } from './actions'
import { insightWhere } from './http'
import { deleteDraftCopy, duplicateCampaign, restoreSegment, skipSegment } from './act-opportunities'

export type ActResult = { ok: true; actionId: string } | { ok: false; status: number; error: string }

export async function takeAction(db: PrismaClient, scope: Scope, insightId: string, action: unknown, input: { sender?: SenderInput } = {}, req?: Request): Promise<ActResult> {
  if (!isActionKind(action)) return { ok: false, status: 400, error: 'Action inconnue.' }
  const insight = await db.insight.findFirst({ where: { id: insightId, ...insightWhere(scope) }, select: { id: true, key: true, campaignId: true, actions: true, status: true } })
  if (!insight || !insight.campaignId) return { ok: false, status: 404, error: 'Alerte introuvable.' }
  if (!insight.actions.includes(action)) return { ok: false, status: 409, error: 'Cette alerte ne propose pas cette action.' }
  if (insight.status === 'RESOLVED') return { ok: false, status: 409, error: 'Cette alerte est déjà résolue.' }
  if (!can(scope.role, ACTIONS[action].permission)) return { ok: false, status: 403, error: 'Votre rôle ne permet pas cette action.' }

  const origin = { req, insightId }
  let before: Prisma.InputJsonObject
  if (action === 'pause') {
    const r = await changeCampaignStatus(db, scope, insight.campaignId, 'pause', origin)
    if (!r.ok) return r
    before = { status: 'ACTIVE' }
    // Done: not offered again until the campaign sends again (the sweep agrees within the hour).
    await db.insight.update({ where: { id: insightId }, data: { actions: insight.actions.filter((a) => a !== 'pause') } })
  } else if (action === 'skip_segment') {
    const r = await skipSegment(db, scope, { key: insight.key, campaignId: insight.campaignId }, origin)
    if (!r.ok) return r
    before = r.before
    await db.insight.update({ where: { id: insightId }, data: { actions: insight.actions.filter((a) => a !== 'skip_segment') } })
  } else if (action === 'duplicate') {
    const r = await duplicateCampaign(db, scope, insight.campaignId, origin)
    if (!r.ok) return r
    before = r.before
  } else {
    if (!input.sender) return { ok: false, status: 400, error: 'Choisissez la boîte d’envoi.' }
    const current = await db.campaign.findFirst({ where: { id: insight.campaignId, ...campaignScope(scope) }, select: { fromAlias: true } })
    const r = await changeCampaignSender(db, scope, insight.campaignId, input.sender, origin)
    if (!r.ok) return r
    before = { mailboxId: r.previous, fromAlias: current?.fromAlias ?? null }
  }
  const row = await db.insightAction.create({
    data: { workspaceId: scope.workspaceId, insightId, campaignId: insight.campaignId, action, actorUserId: scope.userId, before },
  })
  return { ok: true, actionId: row.id }
}

/** Undoing: resume the paused campaign, or put the previous sender back. */
export async function undoAction(db: PrismaClient, scope: Scope, actionId: string, req?: Request): Promise<ActResult> {
  const row = await db.insightAction.findFirst({
    where: { id: actionId, workspaceId: scope.workspaceId, insight: insightWhere(scope) },
    select: { id: true, insightId: true, campaignId: true, action: true, before: true, revertedAt: true },
  })
  if (!row || !row.campaignId || !isActionKind(row.action)) return { ok: false, status: 404, error: 'Action introuvable.' }
  if (row.revertedAt) return { ok: false, status: 409, error: 'Cette action est déjà annulée.' }
  const kind: ActionKind = row.action
  if (!can(scope.role, ACTIONS[kind].permission)) return { ok: false, status: 403, error: 'Votre rôle ne permet pas cette action.' }

  const origin = { req, insightId: row.insightId }
  if (kind === 'pause') {
    const r = await changeCampaignStatus(db, scope, row.campaignId, 'resume', origin)
    if (!r.ok) return r
    const insight = await db.insight.findUnique({ where: { id: row.insightId }, select: { actions: true } })
    if (insight && !insight.actions.includes('pause')) {
      await db.insight.update({ where: { id: row.insightId }, data: { actions: [...insight.actions, 'pause'] } })
    }
  } else if (kind === 'skip_segment') {
    const r = await restoreSegment(db, scope, row.campaignId, row.before as { sendIds?: string[]; dimension?: string; value?: string }, origin)
    if (!r.ok) return r
    const insight = await db.insight.findUnique({ where: { id: row.insightId }, select: { actions: true } })
    if (insight && !insight.actions.includes('skip_segment')) {
      await db.insight.update({ where: { id: row.insightId }, data: { actions: [...insight.actions, 'skip_segment'] } })
    }
  } else if (kind === 'duplicate') {
    const draftId = (row.before as { draftId?: string }).draftId
    if (draftId) {
      const r = await deleteDraftCopy(db, scope, draftId, origin)
      if (!r.ok) return r
    }
  } else {
    const before = row.before as { mailboxId?: string | null; fromAlias?: string | null }
    const r = await changeCampaignSender(db, scope, row.campaignId, { mailboxId: before.mailboxId ?? null, fromAlias: before.fromAlias ?? null }, origin)
    if (!r.ok) return r
  }
  await db.insightAction.update({ where: { id: row.id }, data: { revertedAt: new Date() } })
  return { ok: true, actionId: row.id }
}
