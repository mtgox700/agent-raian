/**
 * Shapes of /dashboard/analytics, derived from the contract (views.analytics),
 * never re-declared by hand.
 */
import type { CallOutput } from '@phantera/sdk'

type AnalyticsView = Exclude<CallOutput<'views.analytics'>, { redirect: string }>

export type AnalyticsReport = AnalyticsView['report']
export type Rate = AnalyticsReport['leaderboard']['pooled']
export type Kpi = AnalyticsReport['kpis'][number]
export type CohortPoint = AnalyticsReport['cohorts'][number]
export type LeaderRow = AnalyticsReport['leaderboard']['ranked'][number]
export type StepPoint = AnalyticsReport['steps'][number]
export type MailboxHealth = AnalyticsReport['mailboxes'][number]
export type DelayCurve = AnalyticsReport['delay']
export type Calibration = AnalyticsReport['calibration']
export type MixWeek = AnalyticsReport['mix'][number]
export type HeatGrid = AnalyticsReport['heatmap']
export type ChannelPoint = AnalyticsReport['channels'][number]
export type SegmentBreakdown = AnalyticsReport['segments']['breakdowns'][number]
export type SegmentPoint = SegmentBreakdown['segments'][number]
export type SegmentMatrix = AnalyticsReport['segments']['matrix']
export type Triangle = AnalyticsReport['triangle']
export type PipelineStage = AnalyticsReport['pipeline'][number]
export type AnnotatedWeek = AnalyticsReport['annotations'][number]
export type GroupComparison = NonNullable<AnalyticsReport['comparison']>
export type ComparedMeasure = GroupComparison['measures'][number]
export type AnalyticsCampaign = AnalyticsReport['campaigns'][number]
