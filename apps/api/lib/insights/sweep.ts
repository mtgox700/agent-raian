/**
 * The hourly sweep: for each workspace with live campaigns, read each
 * campaign's facts and signals, detect (lib/insights/detect), reconcile with
 * the alerts on record (lib/insights/reconcile) and write the result. A new
 * or returning alert leaves one notification; nothing else does.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { getCampaignFacts } from '@/lib/analyst/facts/campaign'
import { checkEmailSendQuota } from '@/lib/stripe/quota'
import { createNotification } from '@/lib/services/notifications.service'
import { detectCampaign, detectWorkspace, type DetectedInsight } from './detect'
import { reconcile, type InsightRecord } from './reconcile'
import { campaignSignals, pendingFirstBySegment } from './signals'
import { detectSegment, detectWinners } from './detect-opportunities'
import { cohortRows } from '@/lib/analytics/queries'
import { buildLeaderboard } from '@/lib/analytics/build'

/** Campaigns read per workspace and per sweep, the most recently active first. */
export const MAX_CAMPAIGNS = 50
const CONCURRENCY = 5
/** Period over which a campaign is compared with the others to call it a winner. */
export const WINNER_DAYS = 90

const PARIS_MONTH = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' })

export interface SweepReport { campaigns: number; unreadable: number; opened: number; reopened: number; refreshed: number; resolved: number }

export async function sweepWorkspace(db: PrismaClient, workspaceId: string, now = new Date()): Promise<SweepReport> {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } })
  if (!workspace) return { campaigns: 0, unreadable: 0, opened: 0, reopened: 0, refreshed: 0, resolved: 0 }
  // The sweep reads as the owner: the whole workspace. Who sees an alert is
  // decided when it is read (the notification and the API apply the scope).
  const scope = { workspaceId, userId: workspace.ownerId, role: 'OWNER' as const }
  const campaigns = await db.campaign.findMany({
    where: { workspaceId, status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true }, orderBy: { updatedAt: 'desc' }, take: MAX_CAMPAIGNS,
  })

  const detected: DetectedInsight[] = []
  const unreadable = new Set<string>()
  for (let i = 0; i < campaigns.length; i += CONCURRENCY) {
    await Promise.all(campaigns.slice(i, i + CONCURRENCY).map(async ({ id }) => {
      try {
        const [facts, signals, pending] = await Promise.all([getCampaignFacts(db, scope, id, now), campaignSignals(db, id, now), pendingFirstBySegment(db, id)])
        if (facts) {
          detected.push(...detectCampaign(facts, signals, now))
          const segment = detectSegment(facts, pending)
          if (segment) detected.push(segment)
        }
      } catch (err) {
        unreadable.add(id)
        console.error('[insights] campaign read failed:', id, err instanceof Error ? err.message : String(err))
      }
    }))
  }
  // A campaign that replies clearly more than the others (the analytics' leaderboard, last 90 days).
  let winnersUnreadable = false
  try {
    const live = await db.campaign.findMany({ where: { workspaceId, status: { not: 'DRAFT' } }, select: { id: true, name: true }, take: 200 })
    const from = new Date(now.getTime() - WINNER_DAYS * 86_400_000)
    const board = buildLeaderboard(await cohortRows(db, live.map((c) => c.id), from, now), from, new Map(live.map((c) => [c.id, c.name])))
    // Finished campaigns included: a campaign that did well is the one worth copying.
    detected.push(...detectWinners(board.ranked, board.pooled))
  } catch (err) {
    console.error('[insights] leaderboard read failed:', workspaceId, err instanceof Error ? err.message : String(err))
    winnersUnreadable = true
  }
  try {
    detected.push(...detectWorkspace(await checkEmailSendQuota(workspaceId), PARIS_MONTH.format(now)))
  } catch (err) {
    console.error('[insights] quota read failed:', workspaceId, err instanceof Error ? err.message : String(err))
  }

  const records = await db.insight.findMany({
    where: { workspaceId, status: { in: ['OPEN', 'SNOOZED'] } },
    select: { id: true, key: true, campaignId: true, status: true, snoozedUntil: true },
  })
  // A resolved row is looked up only for the causes found again.
  const resolved = detected.length
    ? await db.insight.findMany({ where: { workspaceId, status: 'RESOLVED', key: { in: detected.map((d) => d.key) } }, select: { id: true, key: true, campaignId: true, status: true, snoozedUntil: true } })
    : []
  // A leaderboard that could not be read must not look like winners gone.
  const kept = winnersUnreadable ? records.filter((r) => !r.key.startsWith('campagne_gagnante:')) : records
  const ops = reconcile([...kept, ...resolved] as InsightRecord[], detected, unreadable, now)

  const report: SweepReport = { campaigns: campaigns.length, unreadable: unreadable.size, opened: 0, reopened: 0, refreshed: 0, resolved: 0 }
  const fields = (d: DetectedInsight) => ({ kind: d.kind, severity: d.severity, title: d.title, evidence: d.evidence as Prisma.InputJsonArray, next: d.next, actions: d.actions, lastSeenAt: now })
  for (const o of ops) {
    if (o.op === 'open') {
      const row = await db.insight.create({ data: { workspaceId, campaignId: o.insight.campaignId, key: o.insight.key, ...fields(o.insight), openedAt: now } })
      report.opened++
      if (o.notify) await notify(workspaceId, row.id, o.insight)
    } else if (o.op === 'reopen') {
      await db.insight.update({ where: { id: o.id }, data: { ...fields(o.insight), status: 'OPEN', snoozedUntil: null, resolvedAt: null, openedAt: now } })
      report.reopened++
      if (o.notify) await notify(workspaceId, o.id, o.insight)
    } else if (o.op === 'refresh') {
      await db.insight.update({ where: { id: o.id }, data: fields(o.insight) })
      report.refreshed++
    } else {
      await db.insight.update({ where: { id: o.id }, data: { status: 'RESOLVED', resolvedAt: now, snoozedUntil: null } })
      report.resolved++
    }
  }
  return report
}

async function notify(workspaceId: string, insightId: string, d: DetectedInsight): Promise<void> {
  try {
    await createNotification({
      workspaceId, type: 'INSIGHT_ALERT', title: d.title, body: d.next,
      // A campaign's alert reaches who sees the campaign; a workspace one, everyone.
      campaignId: d.campaignId ?? undefined,
      data: { insightId, kind: d.kind, severity: d.severity },
    })
  } catch (err) {
    console.error('[insights] notification failed:', insightId, err instanceof Error ? err.message : String(err))
  }
}

/** Workspaces worth a sweep: at least one live campaign. */
export async function workspacesToSweep(db: PrismaClient): Promise<string[]> {
  const rows = await db.campaign.findMany({ where: { status: { in: ['ACTIVE', 'PAUSED'] } }, select: { workspaceId: true }, distinct: ['workspaceId'] })
  return rows.map((r) => r.workspaceId)
}
