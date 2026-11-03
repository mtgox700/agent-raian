/**
 * Data of the Dashboard home (/dashboard), served by GET /api/views/dashboard:
 * the viewer's first name (Clerk) and the real-time stats of what they may
 * see (lib/services/dashboard.service).
 */

import type { AccessContext } from '@/lib/auth/access'
import { getDashboardStats, type RealDashboardStats } from '@/lib/services/dashboard.service'

export async function dashboardView(
  workspace: AccessContext,
  clerkFirstName: string | null | undefined,
): Promise<{ firstName: string; stats: RealDashboardStats }> {
  const [stats] = await Promise.all([
    getDashboardStats(workspace),
  ])

  const firstName = clerkFirstName ?? 'Agent'
  return { firstName, stats }
}
