/**
 * dashboard.service.ts
 *
 * Fetches all real-time dashboard stats for a workspace from the DB.
 * All queries run in parallel. Returns a shape compatible with the
 * existing dashboard component types (MetricData, PipelineStage, etc.)
 * plus extra fields for the new analytics widgets.
 */

import { db } from '@/lib/db'
import { cardFigures, emptyMetrics, getCampaignMetrics } from '@/lib/campaigns/metrics'
import { campaignScope, leadScope, notificationScope, replyScope, sendScope, type Scope } from '@/lib/auth/scope'
import type {
  MetricData,
  ChartDataPoint,
  PipelineStage,
  ActivityEvent,
  ActivityType,
  Campaign,
  CampaignStatus,
} from '@/lib/types/dashboard'
import {
  compare,
  countByDay,
  lastDayKeys,
  startOfDayIn,
  summarizePeriod,
  wasSent,
} from '@/lib/services/dashboard-metrics'

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Extended return type ─────────────────────────────────────────────────────

export interface EmailHealth {
  openRate:     number   // % (0-100)
  clickRate:    number
  deliveryRate: number
  bounceCount:  number
  sentCount:    number
}

export interface ClassificationBreakdown {
  label: string
  count: number
  color: string
}

export interface TodaySnapshot {
  newLeads:  number
  emailsSent: number
  replies:   number
}

export interface RealDashboardStats {
  // ─ existing component shapes ─
  metrics:        MetricData[]
  pipeline:       PipelineStage[]
  recentActivity: ActivityEvent[]
  chartData:      ChartDataPoint[]
  topCampaigns:   Campaign[]
  // ─ new analytics ─
  emailHealth:    EmailHealth
  classifications: ClassificationBreakdown[]
  todaySnapshot:  TodaySnapshot
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notifTypeToActivity(type: string): ActivityType {
  if (type === 'LEAD_REPLIED_POSITIVE' || type === 'LEAD_REPLIED_MEETING') return 'reply_received'
  if (type === 'LEAD_REPLIED_NEGATIVE' || type === 'LEAD_REPLIED_NEUTRAL') return 'reply_received'
  if (type === 'CAMPAIGN_COMPLETED')    return 'campaign_launched'
  // Mailbox, quota and approval alerts: a neutral icon, not a fake "email sent".
  return 'system'
}

// ─── Main export ──────────────────────────────────────────────────────────────

/** What the caller sees: the whole workspace, or a member's own campaigns and their leads. */
export async function getDashboardStats(scope: Scope): Promise<RealDashboardStats> {
  const now        = new Date()
  const since30d   = new Date(now.getTime() - 30 * DAY_MS)
  const since60d   = new Date(now.getTime() - 60 * DAY_MS)
  const todayStart = startOfDayIn(now)

  const leads = leadScope(scope)
  const visibleCampaigns = campaignScope(scope)
  const notifs = await notificationScope(db, scope)

  // ── All DB queries in parallel ─────────────────────────────────────────────
  const [
    leadsByStatus,
    totalLeads,
    sendRows60d,
    replies60d,
    leadsCreated60d,
    campaigns,
    notifications,
    activeCampaignCount,
  ] = await Promise.all([
    db.lead.groupBy({
      by:    ['status'],
      where: leads,
      _count: { id: true },
    }),

    db.lead.count({ where: leads }),

    // Emails that left the mailbox in the last 60 days: this period and the
    // previous one. Queued rows (PENDING) have no sentAt and stay out.
    db.emailSend.findMany({
      where:  { ...sendScope(scope), sentAt: { gte: since60d } },
      select: { status: true, sentAt: true, openedAt: true, leadId: true, emailStep: { select: { channel: true } } },
    }),

    db.emailReply.findMany({
      where:  { ...replyScope(scope), receivedAt: { gte: since60d } },
      select: { classification: true, receivedAt: true, leadId: true },
    }),

    db.lead.findMany({
      where:  { AND: [leads, { createdAt: { gte: since60d } }] },
      select: { createdAt: true },
    }),

    // Top 4 non-draft campaigns
    db.campaign.findMany({
      where:   { ...visibleCampaigns, status: { notIn: ['DRAFT'] } },
      orderBy: { updatedAt: 'desc' },
      take:    4,
      select: {
        id:             true,
        name:           true,
        status:         true,
        createdAt:      true,
        targetIndustry: true,
        _count:         { select: { leads: true } },
      },
    }),

    db.notification.findMany({
      where:   notifs,
      orderBy: { createdAt: 'desc' },
      take:    15,
      select: {
        id:         true,
        type:       true,
        title:      true,
        body:       true,
        createdAt:  true,
      },
    }),

    db.campaign.count({
      where: { ...visibleCampaigns, status: 'ACTIVE' },
    }),
  ])

  // The channel lives on the sequence step: opens and bounces are counted on emails only.
  const sends60d = sendRows60d.map((s) => ({ status: s.status, sentAt: s.sentAt, openedAt: s.openedAt, leadId: s.leadId, channel: s.emailStep.channel }))
  const current  = summarizePeriod(sends60d, replies60d, since30d, now)
  const previous = summarizePeriod(sends60d, replies60d, since60d, since30d)
  const leadsCurrent  = leadsCreated60d.filter((l) => l.createdAt >= since30d).length
  const leadsPrevious = leadsCreated60d.length - leadsCurrent

  // ── Metric cards: every comparison is against the previous 30 days ───────
  const qualifiedCount = leadsByStatus.find(g => g.status === 'qualified')?._count.id ?? 0

  // Machine figures in cyan, what humans do (replies) in gold, the rest neutral.
  const CYAN = 'var(--brand-primary)'
  const GOLD = 'var(--gold)'
  const NEUTRAL = 'rgb(var(--c-muted))'
  const metrics: MetricData[] = [
    {
      id:      'leads',
      label:   'Nouveaux leads',
      value:   leadsCurrent,
      color:   CYAN,
      caption: '30 derniers jours',
      ...compare(leadsCurrent, leadsPrevious),
    },
    {
      id:      'emails',
      label:   'E-mails envoyés',
      value:   current.sent,
      color:   CYAN,
      caption: current.messages > current.sent
        ? `30 derniers jours, ${current.messages - current.sent} autres messages (LinkedIn, SMS, WhatsApp)`
        : '30 derniers jours',
      ...compare(current.sent, previous.sent),
    },
    {
      id:      'open_rate',
      label:   'Ouvertures',
      value:   current.openRate,
      unit:    '%',
      color:   NEUTRAL,
      // A tracking pixel: blocked by some mail clients, triggered by others' privacy proxies.
      caption: current.openRate === null
        ? 'aucun e-mail délivré sur 30 jours'
        : `${current.opened} sur ${current.delivered} e-mails délivrés, mesure par pixel, indicative`,
      ...compare(current.openRate, previous.openRate),
    },
    {
      id:      'reply_rate',
      label:   'Taux de réponse',
      value:   current.replyRate,
      unit:    '%',
      color:   GOLD,
      caption: current.replyRate === null
        ? 'aucun lead contacté sur 30 jours'
        : `${current.leadsReplied} sur ${current.leadsReached} leads contactés sur 30 jours`,
      ...compare(current.replyRate, previous.replyRate),
    },
    {
      id:            'qualified',
      label:         'Leads qualifiés',
      value:         qualifiedCount,
      color:         GOLD,
      caption:       'au total',
      previousValue: null,
      trend:         'flat',
    },
    {
      id:            'active_campaigns',
      label:         'Campagnes actives',
      value:         activeCampaignCount,
      color:         NEUTRAL,
      caption:       'en ce moment',
      previousValue: null,
      trend:         'flat',
    },
  ]

  // ── Pipeline: the current status of every lead, so stages add up ────────
  const STAGES: Array<{ id: string; label: string; color: string; statuses: string[] }> = [
    { id: 'new',       label: 'Nouveau',  color: 'var(--brand-primary)', statuses: ['new', 'queued'] },
    { id: 'contacted', label: 'Contacté', color: 'var(--brand-primary-deep)', statuses: ['contacted'] },
    { id: 'qualified', label: 'Qualifié', color: 'var(--gold)', statuses: ['qualified'] },
    { id: 'converted', label: 'Converti', color: 'rgb(var(--c-success-fg))', statuses: ['converted'] },
    { id: 'lost',      label: 'Perdu',    color: 'rgb(var(--c-muted))', statuses: ['lost'] },
  ]
  const countFor = (statuses: string[]) =>
    leadsByStatus.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count.id, 0)
  const known = new Set(STAGES.flatMap((s) => s.statuses))
  const other = leadsByStatus.filter((g) => !known.has(g.status)).reduce((sum, g) => sum + g._count.id, 0)

  const pipeline: PipelineStage[] = [
    ...STAGES.map((s) => ({ id: s.id, label: s.label, color: s.color, count: countFor(s.statuses) })),
    ...(other > 0 ? [{ id: 'other', label: 'Autre', color: 'rgb(var(--c-muted))', count: other }] : []),
  ].map((s) => ({ ...s, value: 0, percentage: totalLeads > 0 ? (s.count / totalLeads) * 100 : 0 }))

  // ── 30-day chart (days in Paris time) ─────────────────────────────────────
  const sentByDay    = countByDay(sends60d.filter((s) => s.channel === 'EMAIL' && wasSent(s) && (s.sentAt as Date) >= since30d).map((s) => s.sentAt as Date))
  const repliesByDay = countByDay(replies60d.filter((r) => r.receivedAt >= since30d).map((r) => r.receivedAt))
  const leadsByDay   = countByDay(leadsCreated60d.filter((l) => l.createdAt >= since30d).map((l) => l.createdAt))

  const chartData: ChartDataPoint[] = lastDayKeys(now, 30).map((key) => ({
    date:        new Date(`${key}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    leads:       leadsByDay.get(key)   ?? 0,
    emails:      sentByDay.get(key)    ?? 0,
    replies:     repliesByDay.get(key) ?? 0,
    conversions: 0,
  }))

  // ── Reply classification breakdown (30 days) ──────────────────────────────
  const CLASS_COLORS: Record<string, string> = {
    POSITIVE:        'var(--gold)',
    MEETING_REQUEST: 'var(--gold)',
    NEUTRAL:         'rgb(var(--c-muted))',
    NEGATIVE:        'rgb(var(--c-danger))',
    NOT_INTERESTED:  'rgb(var(--c-muted))',
  }
  const CLASS_LABELS: Record<string, string> = {
    POSITIVE:        'Positif',
    MEETING_REQUEST: 'Rendez-vous',
    NEUTRAL:         'Neutre',
    NEGATIVE:        'Négatif',
    NOT_INTERESTED:  'Pas intéressé',
  }
  const classMap = new Map<string, number>()
  for (const r of replies60d) {
    if (r.receivedAt < since30d) continue
    const c = r.classification ?? 'NEUTRAL'
    classMap.set(c, (classMap.get(c) ?? 0) + 1)
  }
  const classifications: ClassificationBreakdown[] = Array.from(classMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      label: CLASS_LABELS[key] ?? key,
      count,
      color: CLASS_COLORS[key]  ?? 'rgb(var(--c-muted))',
    }))

  // ── Top campaigns: leads in the campaign and leads actually reached ──────
  // From the rows, never the stored counters (lib/campaigns/metrics): a
  // bounced lead is not "contacted", a reply rate counts leads, not messages.
  const campaignMetrics = await getCampaignMetrics(db, campaigns.map((c) => c.id))

  const topCampaigns: Campaign[] = campaigns.map((c) => ({
    id:                 c.id,
    name:               c.name,
    status:             c.status.toLowerCase() as CampaignStatus,
    targetCount:        c._count.leads,
    ...cardFigures(campaignMetrics.get(c.id) ?? emptyMetrics()),
    startDate:          c.createdAt.toISOString(),
    industry:           c.targetIndustry ?? '',
    aiPersonalization:  true,
    qualifiedLeadsCount: 0,
  }))

  // ── Recent activity (from notifications) ──────────────────────────────────
  const recentActivity: ActivityEvent[] = notifications.map((n) => ({
    id:          n.id,
    type:        notifTypeToActivity(n.type),
    title:       n.title,
    description: n.body,
    timestamp:   n.createdAt.toISOString(),
    metadata:    {},
  }))

  // ── Today, in Paris time ──────────────────────────────────────────────────
  const today = summarizePeriod(sends60d, replies60d, todayStart, new Date(now.getTime() + 1))
  const todaySnapshot: TodaySnapshot = {
    newLeads:   leadsCreated60d.filter((l) => l.createdAt >= todayStart).length,
    emailsSent: today.sent,
    replies:    replies60d.filter((r) => r.receivedAt >= todayStart).length,
  }

  return {
    metrics,
    pipeline,
    recentActivity,
    chartData,
    topCampaigns,
    emailHealth: {
      openRate:     current.openRate     ?? 0,
      clickRate:    current.clickRate    ?? 0,
      deliveryRate: current.deliveryRate ?? 0,
      bounceCount:  current.bounced,
      sentCount:    current.sent,
    },
    classifications,
    todaySnapshot,
  }
}
