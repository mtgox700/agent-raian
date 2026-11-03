/**
 * Data of the Analytics page (/dashboard/analytics), served by
 * GET /api/views/analytics: every figure from aggregated queries over the
 * rows the viewer may see (lib/analytics), filtered by the URL (?p=30d&c=…).
 */

import type { PrismaClient } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access'
import { getAnalyticsReport, type AnalyticsReport } from '@/lib/analytics/report'

export async function analyticsView(
  db: PrismaClient,
  workspace: AccessContext,
  params: Record<string, string | string[] | undefined>,
): Promise<{ report: AnalyticsReport }> {
  const report = await getAnalyticsReport(db, workspace, params)
  return { report }
}
