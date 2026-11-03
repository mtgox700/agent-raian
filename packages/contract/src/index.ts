/**
 * @phantera/contract: the API every front relies on.
 *
 * `endpoints` lists every endpoint a front may call. Webhooks, crons, the
 * Inngest endpoint, tracking pixels, the MCP manifest and debug routes are
 * infrastructure, not part of the front contract (see INFRA_ROUTES).
 */

import { activityEndpoints } from './endpoints/activity'
import { aiEndpoints } from './endpoints/ai'
import { analystEndpoints } from './endpoints/analyst'
import { authEndpoints } from './endpoints/auth'
import { campaignsEndpoints } from './endpoints/campaigns'
import { channelsEndpoints } from './endpoints/channels'
import { inboxEndpoints } from './endpoints/inbox'
import { insightsEndpoints } from './endpoints/insights'
import { leadsEndpoints } from './endpoints/leads'
import { mailboxEndpoints } from './endpoints/mailbox'
import { notificationsEndpoints } from './endpoints/notifications'
import { securityEndpoints } from './endpoints/security'
import { stripeEndpoints } from './endpoints/stripe'
import { teamEndpoints } from './endpoints/team'
import { touchesEndpoints } from './endpoints/touches'
import { workspaceEndpoints } from './endpoints/workspace'
import { viewsEndpoints } from './endpoints/views'

export * from './define'
import type { EndpointDef } from './define'
export * from './schemas'

export const endpoints: readonly EndpointDef[] = [
  ...activityEndpoints,
  ...aiEndpoints,
  ...analystEndpoints,
  ...authEndpoints,
  ...campaignsEndpoints,
  ...channelsEndpoints,
  ...inboxEndpoints,
  ...insightsEndpoints,
  ...leadsEndpoints,
  ...mailboxEndpoints,
  ...notificationsEndpoints,
  ...securityEndpoints,
  ...stripeEndpoints,
  ...teamEndpoints,
  ...touchesEndpoints,
  ...workspaceEndpoints,
  ...viewsEndpoints,
]

/** Maps a list of endpoints to `{ [id]: definition }` (per domain: keeps unions small for the compiler). */
type ById<T extends readonly EndpointDef[]> = { [E in T[number] as E['id']]: E }

/** Every endpoint by id, with its exact types: what the SDK is typed from. */
export type EndpointMap =
  ById<typeof activityEndpoints>
  & ById<typeof aiEndpoints>
  & ById<typeof analystEndpoints>
  & ById<typeof authEndpoints>
  & ById<typeof campaignsEndpoints>
  & ById<typeof channelsEndpoints>
  & ById<typeof inboxEndpoints>
  & ById<typeof insightsEndpoints>
  & ById<typeof leadsEndpoints>
  & ById<typeof mailboxEndpoints>
  & ById<typeof notificationsEndpoints>
  & ById<typeof securityEndpoints>
  & ById<typeof stripeEndpoints>
  & ById<typeof teamEndpoints>
  & ById<typeof touchesEndpoints>
  & ById<typeof workspaceEndpoints>
  & ById<typeof viewsEndpoints>

export type EndpointId = keyof EndpointMap & string

/** Route prefixes that exist in the back but are not part of the front contract. */
export const INFRA_ROUTES = [
  '/api/cron/',
  '/api/webhooks/',
  '/api/track/',
  '/api/inngest',
  '/api/mcp',
  '/api/health',
  '/api/security/redteam',
  '/api/auth/gmail/callback',
  '/api/auth/outlook/callback',
  // Debug routes, 404 in production unless ENABLE_DEBUG_ROUTES=1
  '/api/leads/diagnose',
  '/api/mailbox/debug-sends',
  '/api/mailbox/diagnostic',
] as const
