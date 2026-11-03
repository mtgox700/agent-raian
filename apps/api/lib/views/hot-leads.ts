/**
 * Data of the Hot leads page (/dashboard/leads/hot), served by GET /api/views/hot-leads.
 * Hot leads, their count and the workspace funnel, in one parallel round-trip.
 */

import type { Plan } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access'
import { countHotLeads, getHotLeads, type HotLead } from '@/lib/repositories/leads.repository'
import { getWorkspaceFunnel, type FunnelStep } from '@/lib/repositories/campaigns.repository'

export interface HotLeadsView {
  leads: HotLead[]
  hotCount: number
  funnel: FunnelStep[]
  plan: Plan
}

export async function hotLeadsView(workspace: AccessContext): Promise<HotLeadsView> {
  const [{ leads }, hotCount, funnel] = await Promise.all([
    getHotLeads(workspace, 50),
    countHotLeads(workspace),
    getWorkspaceFunnel(workspace),
  ])
  return { leads, hotCount, funnel, plan: workspace.plan }
}
