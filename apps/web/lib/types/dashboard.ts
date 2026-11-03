// ─── Dashboard Domain Types ────────────────────────────────────────────────────

import type { StepChannelDb } from '@/lib/types/channels'

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'
export type ActivityType = 'lead_added' | 'email_sent' | 'reply_received' | 'lead_qualified' | 'campaign_launched' | 'deal_closed' | 'system'

export interface MetricData {
  id: string
  label: string
  /** null when there is nothing to measure yet: never shown as 0. */
  value: number | null
  /** Same metric over the previous period; null when there is nothing to compare. */
  previousValue: number | null
  unit?: string
  prefix?: string
  color: string
  trend: 'up' | 'down' | 'flat'
  /** What the number covers, shown under it ("30 derniers jours"). */
  caption?: string
}

export interface Lead {
  id: string
  firstName: string
  lastName: string
  email: string
  company: string
  title: string
  industry: string
  score: number
  status: LeadStatus
  source: string
  createdAt: string
  lastActivity: string
  enriched: boolean
}

export interface Campaign {
  id: string
  name: string
  status: CampaignStatus
  targetCount: number
  contactedCount: number  // distinct leads with ≥1 message sent (progress numerator)
  /** Distinct leads who replied, refusals included. */
  repliedCount?: number
  /** Messages sent, every channel (lib/campaigns/metrics: from the rows, never the stored counters). */
  sentCount: number
  messagesByChannel?: Record<string, number>
  emailSentCount?: number
  emailOpenedCount?: number
  /** Opened / sent emails, an estimate (privacy proxies open on their own). */
  openRate: number
  /** Leads who replied / leads contacted. */
  replyRate: number
  conversionRate: number
  startDate: string
  endDate?: string
  industry: string
  aiPersonalization: boolean
  qualifiedLeadsCount: number  // FAST_TRACK + NORMAL leads not yet emailed
  /** Channel of the sequence's first step: drives channel-aware UI copy.
   *  Optional so mock/legacy data defaults to EMAIL. */
  firstStepChannel?: StepChannelDb
}

export interface ActivityEvent {
  id: string
  type: ActivityType
  title: string
  description: string
  timestamp: string
  metadata?: {
    leadName?: string
    campaignName?: string
    amount?: number
  }
}

export interface PipelineStage {
  id: string
  label: string
  count: number
  value: number
  color: string
  percentage: number
}

export interface ChartDataPoint {
  date: string
  leads: number
  emails: number
  replies: number
  conversions: number
}

export interface DashboardStats {
  metrics: MetricData[]
  pipeline: PipelineStage[]
  recentActivity: ActivityEvent[]
  chartData: ChartDataPoint[]
  topCampaigns: Campaign[]
  recentLeads: Lead[]
}
