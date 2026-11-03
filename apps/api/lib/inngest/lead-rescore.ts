/**
 * Scores leads again when what their score depends on changes:
 *   - an email verified (its reliability is a fifth of the score),
 *   - the workspace ICP (target industry, company size): the leads not
 *     contacted yet are scored again for the new target.
 * Leads left unscored are retried every day by the housekeeping job.
 *
 * A request never fails the action that triggered it: if Inngest is down,
 * the score simply stays as it was.
 */

import { db } from '@/lib/db'
import { inngest } from './client'
import { leadsAwaitingContact, rescoreLeads } from '@/lib/leads/rescore'

export const LEAD_RESCORE_EVENT = 'lead/rescore.requested'

export type RescoreReason = 'enrichment' | 'icp'

export async function requestRescore(workspaceId: string, reason: RescoreReason, leadIds?: string[]): Promise<void> {
  if (leadIds && leadIds.length === 0) return
  await inngest.send({ name: LEAD_RESCORE_EVENT, data: { workspaceId, reason, leadIds } }).catch((err: unknown) => {
    console.error('[lead-rescore] request not sent:', err instanceof Error ? err.message : String(err))
  })
}

type StepLike = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }

export const leadRescore = inngest.createFunction(
  {
    id:          'lead-rescore',
    name:        'Score leads again after a change',
    retries:     2,
    // One run per workspace at a time; a burst of enrichments queues up.
    concurrency: { key: 'event.data.workspaceId', limit: 1 },
    triggers:    [{ event: LEAD_RESCORE_EVENT }],
  },
  async ({ event, step }) => {
    const { workspaceId, reason, leadIds } = event.data as { workspaceId?: string; reason?: RescoreReason; leadIds?: string[] }
    if (!workspaceId) return { skipped: 'no workspace' }
    const s = step as unknown as StepLike
    const ids = leadIds?.length ? leadIds : reason === 'icp' ? await s.run('pick-leads', () => leadsAwaitingContact(db, workspaceId)) : []
    if (ids.length === 0) return { skipped: 'nothing to score' }
    return s.run('rescore', () => rescoreLeads(db, workspaceId, ids))
  },
)
