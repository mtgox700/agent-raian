/**
 * Shapes of the views, derived from the contract (never re-declared by hand).
 * Add the ones a screen's components share here.
 */
import type { CallOutput } from '@phantera/sdk'

type DashboardView = Exclude<CallOutput<'views.dashboard'>, { redirect: string }>

export type DashboardStats = DashboardView['stats']
export type DashboardMetric = DashboardStats['metrics'][number]
export type DashboardCampaign = DashboardStats['topCampaigns'][number]
export type DashboardPipelineStage = DashboardStats['pipeline'][number]
export type DashboardChartPoint = DashboardStats['chartData'][number]
export type DashboardClassification = DashboardStats['classifications'][number]
export type DashboardEmailHealth = DashboardStats['emailHealth']
export type ActivityEvent = CallOutput<'activity.list'>['events'][number]
export type InsightsList = CallOutput<'insights.list'>
export type InsightOpen = InsightsList['insights'][number]
export type InsightRecentAction = InsightsList['recent'][number]
export type SenderMailbox = CallOutput<'mailbox.senders'>['mailboxes'][number]
