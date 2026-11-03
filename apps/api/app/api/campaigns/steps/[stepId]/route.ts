/**
 * PATCH /api/campaigns/steps/[stepId]
 *
 * Edits a sequence step (subject, body, delay, LinkedIn invite note) while
 * some lead has not received it yet (lib/actions/update-campaign-step).
 * Access is checked on the step's own workspace.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { updateCampaignStep } from '@/lib/actions/update-campaign-step'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ stepId: string }> }

export async function PATCH(req: Request, { params }: Params): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { stepId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const fields = body && typeof body === 'object' && !Array.isArray(body) ? body : {}

  const result = await updateCampaignStep(
    { ...fields, stepId },
    (workspaceId) => requireAccess(userId, 'campaign.write', { workspaceId }),
  )
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}
