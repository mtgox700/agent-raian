/**
 * The SDK as seen from a client component of body n°2. Every call goes
 * through the contract (@phantera/contract): never a hand-written /api URL.
 *
 *   import { api } from '@/lib/front/api'
 *   await api.call('workspace.completeOnboarding', { body: { workspaceName } })
 *   const src = api.url('notifications.stream', { query: { since } })
 *
 * Endpoints with `auth: 'stepUp'` need Clerk's re-verification dialog: use
 * `useApi()` (lib/front/use-api) inside a component, which wires stepUpFetch.
 */
import { createClient } from '@phantera/sdk'

export const api = createClient()
