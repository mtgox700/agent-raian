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

export * from './define'
export * from './schemas'

export const endpoints = [
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
] as const

export type Endpoints = typeof endpoints
export type EndpointId = Endpoints[number]['id']

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
