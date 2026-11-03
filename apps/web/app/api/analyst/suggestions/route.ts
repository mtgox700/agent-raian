/** GET /api/analyst/suggestions: questions drawn from the E2 diagnoses of the asker's campaigns. */

import { auth } from '@clerk/nextjs/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { suggested } from '@/lib/analyst/http'

export async function GET() {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'analyst.ask')
  if (!access.ok) return accessDenied(access)
  return suggested(access.ctx)
}
