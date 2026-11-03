/**
 * POST /api/campaigns
 *
 * Creates a campaign from the wizard (body: the wizard data, see
 * lib/actions/create-campaign). AI prospecting is queued as an Inngest job;
 * on existing leads, step 1 is queued at once.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { campaignWizardSchema, createCampaign } from '@/lib/actions/create-campaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const wizard = campaignWizardSchema.safeParse(body)
  if (!wizard.success) {
    return NextResponse.json({ error: 'Données de campagne invalides.' }, { status: 422 })
  }

  // The active workspace, with the right to create campaigns in it.
  const result = await createCampaign(userId, wizard.data, () => requireAccess(userId, 'campaign.write'))
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result, { status: 201 })
}
