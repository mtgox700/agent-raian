/** Activity feed of the dashboard. */

import { z } from 'zod'
import { endpoint } from '../define'
import { ActivityEvent } from '../schemas/activity'

export const activityEndpoints = [
  // app/api/activity/route.ts
  endpoint({
    id: 'activity.list',
    method: 'GET',
    path: '/api/activity',
    summary: 'Recent activity of the workspace (sends, opens, replies), newest first. Empty list without access.',
    auth: 'session',
    // Handler: parseInt(limit ?? '20'), capped at 50.
    query: z.object({ limit: z.string().optional() }),
    response: z.object({ events: z.array(ActivityEvent) }),
  }),
]
