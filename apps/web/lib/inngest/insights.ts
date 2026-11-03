/**
 * Proactive alerts, every hour: one step per workspace, so a failing
 * workspace is retried alone and never stops the others.
 */

import { inngest } from './client'
import type { StepLike } from './functions'
import { db } from '@/lib/db'
import { sweepWorkspace, workspacesToSweep } from '@/lib/insights/sweep'

export const insightsSweep = inngest.createFunction(
  {
    id:          'insights-sweep',
    name:        'Proactive alerts sweep',
    retries:     1,
    concurrency: { limit: 1 },
    triggers:    [{ cron: 'TZ=Europe/Paris 15 * * * *' }],
  },
  async ({ step }) => {
    // Called on the step object: its methods are not meant to be detached.
    const s = step as unknown as StepLike
    const ids = await s.run('workspaces', () => workspacesToSweep(db))
    const reports: Record<string, unknown> = {}
    for (const id of ids) reports[id] = await s.run(`sweep-${id}`, () => sweepWorkspace(db, id))
    return reports
  },
)
