/** View endpoint: the data of the Analytics page (/dashboard/analytics), mirror of apps/web/lib/analytics. */

import { z } from 'zod'
import { endpoint, IsoDate } from '../../define'

/** No workspace access: the page sends to onboarding. */
export const AnalyticsViewRedirect = z.object({ redirect: z.literal('/onboarding') })

const Interval = z.object({ low: z.number(), high: z.number() })
/** A rate with its 95 % Wilson interval (lib/analyst/facts/campaign). */
const Rate = z.object({ successes: z.number(), n: z.number(), rate: z.number(), ci: Interval })
const Verdict = z.enum(['significatif', 'tendance', 'insuffisant'])

export const AnalyticsKpi = z.object({
  key: z.enum(['contacted', 'reply', 'positive', 'bounce']),
  label: z.string(),
  rate: Rate.optional(),
  previous: Rate.optional(),
  trend: z.object({ verdict: Verdict, delta: z.number(), reason: z.string().nullable() }).optional(),
  value: z.number().optional(),
  previousValue: z.number().optional(),
  note: z.string().optional(),
})

export const AnalyticsLeaderRow = z.object({
  campaignId: z.string(),
  name: z.string(),
  rate: Rate,
  verdict: Verdict.nullable(),
  direction: z.enum(['au-dessus', 'en-dessous']).nullable(),
})

const RateFact = z.object({ label: z.string(), successes: z.number(), n: z.number(), rate: z.number(), ci: Interval })

export const RateComparison = z.object({
  metric: z.string(),
  a: RateFact,
  b: RateFact,
  delta: z.number(),
  deltaCi: Interval,
  pValue: z.number().nullable(),
  adjustedP: z.number().nullable(),
  method: z.enum(['fisher', 'z']).nullable(),
  n: z.number(),
  verdict: Verdict,
  confounders: z.array(z.string()),
  reason: z.string().nullable(),
  exploratory: z.boolean(),
})

const SegmentPoint = z.object({
  value: z.string(),
  label: z.string(),
  rate: Rate,
  verdict: Verdict.nullable(),
  direction: z.enum(['au-dessus', 'en dessous']).nullable(),
  pooled: z.boolean(),
})

export const AnalyticsReport = z.object({
  period: z.enum(['7d', '30d', '90d']),
  days: z.number(),
  selected: z.array(z.string()),
  campaigns: z.array(z.object({ id: z.string(), name: z.string() })),
  kpis: z.array(AnalyticsKpi),
  cohorts: z.array(z.object({
    week: z.string(),
    contacted: z.number(),
    mature: z.number(),
    rate: Rate,
    provisional: z.boolean(),
  })),
  leaderboard: z.object({ ranked: z.array(AnalyticsLeaderRow), insufficient: z.array(AnalyticsLeaderRow), pooled: Rate }),
  steps: z.array(z.object({
    position: z.number(),
    channel: z.string(),
    reached: z.number(),
    dropped: z.number().nullable(),
    replyRate: Rate,
    positive: z.number(),
    bounced: z.number(),
    pending: z.boolean(),
  })),
  mailboxes: z.array(z.object({
    mailboxId: z.string(),
    label: z.string(),
    status: z.string(),
    sent: z.number(),
    bounce: Rate,
    level: z.enum(['ok', 'vigilance', 'danger', 'insuffisant']),
    weeks: z.array(z.object({ week: z.string(), bounce: Rate })),
  })),
  delay: z.object({
    points: z.array(z.object({ t: z.number(), replied: z.number(), ci: Interval })),
    events: z.number(),
    leads: z.number(),
    marks: z.array(z.object({ day: z.number(), share: z.number() })),
    enough: z.boolean(),
  }),
  calibration: z.object({
    badges: z.array(z.object({ badge: z.string(), rate: Rate, enough: z.boolean() })),
    topVsNormal: z.object({ verdict: Verdict, delta: z.number() }).nullable(),
    coverage: Rate,
  }),
  mix: z.array(z.object({
    week: z.string(),
    total: z.number(),
    positive: z.number(),
    negative: z.number(),
    neutral: z.number(),
    positiveRate: Rate,
  })),
  heatmap: z.object({
    sent: z.array(z.array(z.number())),
    replied: z.array(z.array(z.number())),
    maxSent: z.number(),
    maxReplied: z.number(),
    totalSent: z.number(),
    totalReplied: z.number(),
  }),
  channels: z.array(z.object({ channel: z.string(), reached: z.number(), rate: Rate.nullable(), note: z.string().nullable() })),
  segments: z.object({
    breakdowns: z.array(z.object({
      dimension: z.enum(['seniority', 'industry', 'companySize', 'country']),
      title: z.string(),
      comparable: z.boolean(),
      segments: z.array(SegmentPoint),
      unknown: Rate,
      measured: z.number(),
    })),
    matrix: z.object({
      columns: z.array(z.object({ value: z.string(), label: z.string() })),
      rows: z.array(z.object({
        value: z.string(),
        label: z.string(),
        cells: z.array(z.object({ rate: Rate, enough: z.boolean() })),
        total: Rate,
      })),
    }),
    singleCampaign: z.boolean(),
  }),
  triangle: z.object({
    days: z.array(z.number()),
    weeks: z.array(z.object({
      week: z.string(),
      contacted: z.number(),
      cells: z.array(z.object({ day: z.number(), rate: Rate, state: z.enum(['complete', 'partial', 'pending']) })),
    })),
    reference: z.array(Rate.nullable()),
  }),
  pipeline: z.array(z.object({
    key: z.enum(['contacted', 'replied', 'interested', 'meeting', 'won']),
    label: z.string(),
    count: z.number(),
    ofContacted: Rate.nullable(),
    medianDays: z.number().nullable(),
    note: z.string().optional(),
  })),
  annotations: z.array(z.object({
    week: z.string(),
    events: z.array(z.object({
      kind: z.enum(['launch', 'pause', 'resume', 'complete']),
      campaignId: z.string(),
      campaign: z.string(),
      at: IsoDate,
    })),
  })),
  versus: z.array(z.string()),
  comparison: z.object({
    a: z.object({ label: z.string(), campaigns: z.number() }),
    b: z.object({ label: z.string(), campaigns: z.number() }),
    measures: z.array(z.object({
      key: z.enum(['reply', 'positive', 'bounce']),
      label: z.string(),
      a: Rate,
      b: Rate,
      comparison: RateComparison,
    })),
    differences: z.array(z.string()),
  }).nullable(),
  generatedAt: IsoDate,
})

export const analyticsViewEndpoints = [
  // app/api/views/analytics/route.ts
  endpoint({
    id: 'views.analytics',
    method: 'GET',
    path: '/api/views/analytics',
    summary: 'Analytics page: aggregated figures over the visible campaigns, filtered by period (p), campaigns (c) and comparison (vs) (`{ redirect }` without workspace access).',
    auth: 'session',
    query: z.object({
      p: z.string().optional(),
      c: z.string().optional(),
      vs: z.string().optional(),
    }),
    response: z.union([
      AnalyticsViewRedirect,
      z.object({ report: AnalyticsReport }),
    ]),
  }),
]
