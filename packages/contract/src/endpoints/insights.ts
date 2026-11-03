/** Insights: open alerts, one-click actions, snooze, undo. */

import { z } from 'zod'
import { endpoint, Id, IsoDate } from '../define'
import { InsightOpen, InsightRecentAction } from '../schemas/insight'

const Sender = z.object({ mailboxId: z.string().min(1).max(64).nullable(), fromAlias: z.string().min(3).max(254).nullable() })

export const insightsEndpoints = [
  // app/api/insights/route.ts
  endpoint({
    id: 'insights.list',
    method: 'GET',
    path: '/api/insights',
    summary: 'Open alerts the caller may see, number of snoozed ones and recent actions taken.',
    auth: 'session',
    query: z.object({ campaignId: Id.optional() }),
    response: z.object({
      insights: z.array(InsightOpen),
      snoozed: z.number().int(),
      recent: z.array(InsightRecentAction),
    }),
  }),

  // app/api/insights/[id]/act/route.ts
  endpoint({
    id: 'insights.act',
    method: 'POST',
    path: '/api/insights/[id]/act',
    summary: 'Take one of the alert\'s one-click actions (pause, change sender, skip segment, duplicate).',
    auth: 'session',
    params: z.object({ id: Id }),
    // Handler validates only a string 1..40; takeAction answers 400 for unknown kinds (pause, change_sender, skip_segment, duplicate).
    body: z.object({ action: z.string().min(1).max(40), sender: Sender.optional() }),
    response: z.object({ ok: z.literal(true), actionId: Id }),
  }),

  // app/api/insights/[id]/snooze/route.ts
  endpoint({
    id: 'insights.snooze',
    method: 'POST',
    path: '/api/insights/[id]/snooze',
    summary: 'Silence one alert for 7 or 30 days.',
    auth: 'session',
    params: z.object({ id: Id }),
    body: z.object({ days: z.union([z.literal(7), z.literal(30)]) }),
    response: z.object({ ok: z.literal(true), snoozedUntil: IsoDate }),
  }),

  // app/api/insights/actions/[actionId]/undo/route.ts
  endpoint({
    id: 'insights.undoAction',
    method: 'POST',
    path: '/api/insights/actions/[actionId]/undo',
    summary: 'Undo an action taken from an alert.',
    auth: 'session',
    params: z.object({ actionId: Id }),
    response: z.object({ ok: z.literal(true), actionId: Id }),
  }),
]
