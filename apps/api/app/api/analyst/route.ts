/**
 * GET /api/analyst: what the Analyst screen needs to open: availability,
 * the month's quota, the asker's own conversations, the campaigns they can
 * compare, suggested questions.
 */

import { auth } from '@clerk/nextjs/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { overview } from '@/lib/analyst/http'

export async function GET() {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'analyst.ask')
  if (!access.ok) return accessDenied(access)
  return overview(access.ctx)
}
