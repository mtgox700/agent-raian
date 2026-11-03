/**
 * The analytics page's data: what the viewer may see (members, their own
 * campaigns), filtered by the URL, counted in a few aggregated queries.
 */

import type { PrismaClient } from '@prisma/client'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { buildCalibration, buildChannels, buildCohorts, buildDelay, buildHeatmap, buildKpis, buildLeaderboard, buildMailboxes, buildMix, buildSteps, type Calibration, type ChannelPoint, type CohortPoint, type DelayCurve, type HeatGrid, type Kpi, type LeaderRow, type MailboxHealth, type MixWeek, type StepPoint } from './build'
import { parseFilters, type PeriodKey } from './filters'
import { badgeRows, channelRows, classificationRows, cohortRows, delayRows, hourRows, mailboxRows, pipelineRow, segmentRows, statusEventRows, stepRows, triangleRows } from './queries'
import { buildAnnotations, type AnnotatedWeek } from './annotations'
import { buildGroupComparison, targetingSignature, type GroupComparison, type GroupProfile } from './compare-groups'
import type { CohortRow } from './queries'
import { buildSegments, type Segments } from './segments'
import { buildPipeline, buildTriangle, type PipelineStage, type Triangle } from './pipeline'
import type { Rate } from '@/lib/analyst/facts/campaign'

const COHORT_WEEKS = 12
const DAY = 86_400_000

export interface AnalyticsReport {
  period: PeriodKey
  days: number
  selected: string[]
  campaigns: Array<{ id: string; name: string }>
  kpis: Kpi[]
  cohorts: CohortPoint[]
  leaderboard: { ranked: LeaderRow[]; insufficient: LeaderRow[]; pooled: Rate }
  steps: StepPoint[]
  mailboxes: MailboxHealth[]
  delay: DelayCurve
  calibration: Calibration
  mix: MixWeek[]
  heatmap: HeatGrid
  channels: ChannelPoint[]
  segments: Segments
  triangle: Triangle
  pipeline: PipelineStage[]
  /** Launches, pauses, resumes and ends, per week of the trend. */
  annotations: AnnotatedWeek[]
  /** Comparison mode (?vs=…): the selection, or all the others, against these campaigns. */
  versus: string[]
  comparison: GroupComparison | null
  generatedAt: string
}

export async function getAnalyticsReport(db: PrismaClient, scope: Scope, params: Record<string, string | string[] | undefined>, now = new Date()): Promise<AnalyticsReport> {
  const visible = await db.campaign.findMany({
    where: { ...campaignScope(scope), status: { not: 'DRAFT' } },
    select: { id: true, name: true }, orderBy: { updatedAt: 'desc' }, take: 200,
  })
  const filters = parseFilters(params, visible.map((c) => c.id), now)
  const ids = filters.campaignIds.length ? filters.campaignIds : visible.map((c) => c.id)
  const names = new Map(visible.map((c) => [c.id, c.name]))

  // Cohorts look back far enough for the previous period and 12 weeks of trend.
  const cohortSince = new Date(Math.min(filters.previousFrom.getTime(), now.getTime() - COHORT_WEEKS * 7 * DAY))
  const trendSince = new Date(now.getTime() - COHORT_WEEKS * 7 * DAY)
  const [cohorts, steps, mailboxes, mailboxInfo, delays, badges, classes, hours, channels, segments, triangle, pipeline, statusEvents] = await Promise.all([
    cohortRows(db, ids, cohortSince, now),
    stepRows(db, ids, filters.from, now),
    mailboxRows(db, ids, new Date(Math.min(filters.previousFrom.getTime(), now.getTime() - COHORT_WEEKS * 7 * DAY)), now),
    db.connectedMailbox.findMany({ where: { workspaceId: scope.workspaceId }, select: { id: true, email: true, status: true } }),
    delayRows(db, ids, filters.from, now),
    badgeRows(db, ids, filters.from, now),
    classificationRows(db, ids, trendSince, now),
    hourRows(db, ids, filters.from, now),
    channelRows(db, ids, filters.from, now),
    segmentRows(db, ids, filters.from, now),
    triangleRows(db, ids, trendSince, now),
    pipelineRow(db, ids, filters.from, now),
    statusEventRows(db, ids, trendSince, now),
  ])
  const comparison = filters.versusIds.length
    ? await compareGroups(db, filters.campaignIds.length ? filters.campaignIds : visible.map((c) => c.id).filter((id) => !filters.versusIds.includes(id)), filters.versusIds, names, filters.campaignIds.length === 0, cohortSince, filters.from, filters.previousFrom, now)
    : null
  const labels = new Map(mailboxInfo.map((m) => [m.id, { label: m.email, status: m.status }]))
  const trendCut = new Date(now.getTime() - COHORT_WEEKS * 7 * DAY)

  return {
    period: filters.period,
    days: filters.days,
    selected: filters.campaignIds,
    campaigns: visible,
    kpis: buildKpis(cohorts, filters.from, mailboxes, filters.previousFrom),
    cohorts: buildCohorts(cohorts.filter((r) => new Date(`${r.day}T12:00:00Z`) >= trendCut)),
    leaderboard: buildLeaderboard(cohorts, filters.from, names),
    steps: buildSteps(steps),
    mailboxes: buildMailboxes(mailboxes, filters.from, labels),
    delay: buildDelay(delays),
    calibration: buildCalibration(badges),
    mix: buildMix(classes),
    heatmap: buildHeatmap(hours),
    channels: buildChannels(channels),
    // One campaign: same message, mailbox and period, so a segment gap can be proven.
    segments: buildSegments(segments, ids.length === 1),
    triangle: buildTriangle(triangle),
    pipeline: buildPipeline(pipeline),
    annotations: buildAnnotations(statusEvents, names),
    versus: filters.versusIds,
    comparison,
    generatedAt: now.toISOString(),
  }
}

/** Mean age in days of the leads first contacted since `from`, from the cohort rows. */
function meanAge(rows: CohortRow[], from: Date, now: Date): number | null {
  const kept = rows.filter((r) => new Date(`${r.day}T12:00:00Z`) >= from)
  const n = kept.reduce((a, r) => a + r.contacted, 0)
  if (n === 0) return null
  return kept.reduce((a, r) => a + r.contacted * (now.getTime() - new Date(`${r.day}T12:00:00Z`).getTime()), 0) / n / DAY
}

function sideLabel(ids: string[], names: Map<string, string>, others: boolean): string {
  if (others) return 'Les autres campagnes'
  return ids.length === 1 ? (names.get(ids[0]) ?? 'Campagne') : `${ids.length} campagnes`
}

async function compareGroups(db: PrismaClient, a: string[], b: string[], names: Map<string, string>, aIsOthers: boolean, since: Date, from: Date, previousFrom: Date, now: Date): Promise<GroupComparison | null> {
  if (a.length === 0) return null
  const [cohortsA, cohortsB, boxesA, boxesB, campaigns] = await Promise.all([
    cohortRows(db, a, since, now), cohortRows(db, b, since, now),
    mailboxRows(db, a, since, now), mailboxRows(db, b, since, now),
    db.campaign.findMany({ where: { id: { in: [...a, ...b] } }, select: { id: true, connectedMailboxId: true, targetIndustry: true, targetTitles: true, targetCompanySizes: true, targetGeos: true } }),
  ])
  const byId = new Map(campaigns.map((c) => [c.id, c]))
  const profile = (ids: string[], label: string, rows: CohortRow[]): GroupProfile => {
    const cs = ids.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c)
    return {
      label, campaigns: ids.length,
      mailboxes: cs.map((c) => c.connectedMailboxId ?? 'partagé'),
      targeting: cs.map((c) => targetingSignature(c)),
      ageDays: meanAge(rows, from, now),
    }
  }
  return buildGroupComparison(
    buildKpis(cohortsA, from, boxesA, previousFrom), buildKpis(cohortsB, from, boxesB, previousFrom),
    profile(a, sideLabel(a, names, aIsOthers), cohortsA), profile(b, sideLabel(b, names, false), cohortsB),
  )
}
