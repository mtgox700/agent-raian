/** Shapes of the Hot leads screen (/dashboard/leads/hot), derived from the contract. */
import type { CallOutput } from '@phantera/sdk'

export type HotLeadsView = Exclude<CallOutput<'views.hotLeads'>, { redirectTo: string }>
export type HotLead = HotLeadsView['leads'][number]
export type FunnelStep = HotLeadsView['funnel'][number]
