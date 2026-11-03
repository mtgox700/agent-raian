/**
 * The alerts as the user reads and silences them. Authentication and
 * requireAccess happen in the routes; nothing here trusts the request for who
 * is asking.
 */

import { NextResponse } from 'next/server'
import type { Prisma, PrismaClient } from '@prisma/client'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { can } from '@/lib/auth/permissions'
import { SENT_STATUSES } from '@/lib/sequences/types'
import { ACTIONS, impactOf, isActionKind } from './actions'

/** The alerts a person may see: their campaigns' ones, and the workspace's. */
export function insightWhere(scope: Scope, campaignId?: string): Prisma.InsightWhereInput {
  const visible: Prisma.InsightWhereInput = { OR: [{ campaignId: null }, { campaign: campaignScope(scope) }] }
  return {
    workspaceId: scope.workspaceId,
    ...(campaignId ? { campaignId, campaign: campaignScope(scope) } : visible),
  }
}

const SEVERITY_ORDER: Record<string, number> = { bloquant: 0, alerte: 1, opportunite: 2 }

/** Actions taken from alerts shown with their effect, for this many days. */
export const RECENT_ACTION_DAYS = 14

export async function listInsights(db: PrismaClient, scope: Scope, campaignId?: string, now = new Date()): Promise<Response> {
  const where = insightWhere(scope, campaignId)
  const [open, snoozed, taken] = await Promise.all([
    db.insight.findMany({
      where: { ...where, status: 'OPEN' },
      select: { id: true, kind: true, severity: true, title: true, evidence: true, next: true, actions: true, campaignId: true, openedAt: true, lastSeenAt: true, campaign: { select: { name: true } } },
      orderBy: { openedAt: 'desc' }, take: 50,
    }),
    db.insight.count({ where: { ...where, status: 'SNOOZED' } }),
    db.insightAction.findMany({
      where: { workspaceId: scope.workspaceId, insight: where, createdAt: { gte: new Date(now.getTime() - RECENT_ACTION_DAYS * 86_400_000) } },
      select: { id: true, action: true, campaignId: true, createdAt: true, revertedAt: true, before: true, insight: { select: { title: true, campaign: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 20,
    }),
  ])
  // What each action offers to whoever reads: only what their role allows.
  const offer = (kinds: string[]) => kinds.filter(isActionKind).filter((k) => can(scope.role, ACTIONS[k].permission))
    .map((k) => ({ kind: k, label: ACTIONS[k].label, confirm: ACTIONS[k].confirm }))
  const insights = open
    .map(({ campaign, actions, ...i }) => ({ ...i, campaignName: campaign?.name ?? null, actions: offer(actions) }))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
  // A previous sender that is no longer connected cannot be put back: not offered.
  const previousBoxes = taken.filter((t) => t.action === 'change_sender').map((t) => (t.before as { mailboxId?: string | null }).mailboxId).filter((id): id is string => !!id)
  const usable = new Set(previousBoxes.length
    ? (await db.connectedMailbox.findMany({ where: { id: { in: previousBoxes }, workspaceId: scope.workspaceId, status: 'CONNECTED' }, select: { id: true } })).map((m) => m.id)
    : [])
  const undoable = (t: (typeof taken)[number]) => {
    if (t.action !== 'change_sender') return true
    const prev = (t.before as { mailboxId?: string | null }).mailboxId
    return prev == null || usable.has(prev)
  }
  const recent = await Promise.all(taken.filter((t) => isActionKind(t.action)).map(async (t) => {
    const sentSince = t.campaignId
      ? await db.emailSend.count({ where: { campaignId: t.campaignId, sentAt: { gte: t.createdAt }, status: { in: [...SENT_STATUSES] } } })
      : 0
    const kind = t.action as keyof typeof ACTIONS
    const before = t.before as { count?: number; draftId?: string }
    // The copy is looked up within what the reader may see.
    const copy = kind === 'duplicate' && before.draftId
      ? await db.campaign.findFirst({ where: { id: before.draftId, ...campaignScope(scope) }, select: { id: true, status: true } })
      : null
    return {
      id: t.id, kind, label: ACTIONS[kind].label,
      undoLabel: can(scope.role, ACTIONS[kind].permission) && !t.revertedAt && undoable(t) ? ACTIONS[kind].undoLabel : null,
      undoBlocked: !t.revertedAt && !undoable(t) ? 'L’ancien expéditeur est déconnecté : il ne peut pas être remis.' : null,
      campaignId: t.campaignId, campaignName: t.insight.campaign?.name ?? null, alert: t.insight.title,
      at: t.createdAt.toISOString(),
      impact: impactOf({ action: kind, createdAt: t.createdAt, revertedAt: t.revertedAt }, { sentSince, skipped: before.count, copyStatus: copy?.status ?? null }, now),
      link: copy && !t.revertedAt ? { href: `/dashboard/campaigns/${copy.id}`, label: copy.status === 'DRAFT' ? 'Ouvrir le brouillon' : 'Ouvrir la copie' } : null,
    }
  }))
  return NextResponse.json({ insights, snoozed, recent })
}

export const SNOOZE_DAYS = [7, 30] as const
const DAY = 86_400_000

/**
 * Silences one alert for 7 or 30 days. A campaign's alert by who may change
 * the campaign; a workspace's alert (the plan quota) by who manages settings.
 */
export async function snoozeInsight(db: PrismaClient, scope: Scope, id: string, days: unknown, now = new Date()): Promise<Response> {
  if (!(SNOOZE_DAYS as readonly unknown[]).includes(days)) return NextResponse.json({ error: 'Durée invalide : 7 ou 30 jours.' }, { status: 400 })
  const insight = await db.insight.findFirst({ where: { id, ...insightWhere(scope) }, select: { id: true, campaignId: true, status: true } })
  if (!insight) return NextResponse.json({ error: 'Alerte introuvable.' }, { status: 404 })
  const allowed = insight.campaignId ? can(scope.role, 'campaign.write') : can(scope.role, 'settings.manage')
  if (!allowed) return NextResponse.json({ error: 'Vous ne pouvez pas mettre cette alerte en silence.' }, { status: 403 })
  if (insight.status === 'RESOLVED') return NextResponse.json({ error: 'Cette alerte est déjà résolue.' }, { status: 409 })
  const until = new Date(now.getTime() + (days as number) * DAY)
  await db.insight.update({ where: { id }, data: { status: 'SNOOZED', snoozedUntil: until } })
  return NextResponse.json({ ok: true, snoozedUntil: until.toISOString() })
}
