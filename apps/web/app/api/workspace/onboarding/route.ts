/**
 * PATCH /api/workspace/onboarding
 *
 * Allows updating workspace onboarding fields after initial setup.
 * Used from the settings page or anywhere the user wants to reconfigure
 * their ICP (ideal customer profile) or sending domain.
 *
 * All fields are optional: only provided fields are updated.
 */

import { NextResponse }      from 'next/server'
import { requestRescore } from '@/lib/inngest/lead-rescore'
import { auth }              from '@clerk/nextjs/server'
import { z }                 from 'zod'
import { Prisma }            from '@prisma/client'
import { db }                from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'

const patchSchema = z.object({
  workspaceName: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(50)
    .trim()
    .optional(),

  targetIndustry: z.string().min(1).optional(),

  targetCompanySize: z
    .enum(['XS', 'S', 'M', 'L', 'XL'])
    .optional(),

  sendingDomain: z
    .string()
    .regex(
      /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      'Invalid domain format',
    )
    .optional()
    .or(z.literal('')),
})

export async function PATCH(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'settings.manage')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 422 },
    )
  }

  const { workspaceName, targetIndustry, targetCompanySize, sendingDomain } = parsed.data

  // Build update data using Prisma's typed input: catches field-name typos at compile time
  const updateData: Prisma.WorkspaceUpdateInput = {}
  if (workspaceName !== undefined)     updateData.name              = workspaceName
  if (targetIndustry !== undefined)    updateData.targetIndustry    = targetIndustry
  if (targetCompanySize !== undefined) updateData.targetCompanySize = targetCompanySize
  if (sendingDomain !== undefined)     updateData.sendingDomain     = sendingDomain || null

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 })
  }

  const before = await db.workspace.findUnique({
    where:  { id: workspace.workspaceId },
    select: { targetIndustry: true, targetCompanySize: true },
  })

  const updated = await db.workspace.update({
    where:  { id: workspace.workspaceId },
    data:   updateData,
    select: {
      name: true, targetIndustry: true,
      targetCompanySize: true, sendingDomain: true,
    },
  })

  // A new target: the leads not contacted yet are scored for it.
  if (before && (before.targetIndustry !== updated.targetIndustry || before.targetCompanySize !== updated.targetCompanySize)) {
    await requestRescore(workspace.workspaceId, 'icp')
  }

  return NextResponse.json({ ok: true, workspace: updated })
}

/**
 * GET /api/workspace/onboarding
 *
 * Returns the current onboarding status for the workspace.
 * Useful for client-side checks (e.g. showing an "incomplete" banner).
 */
export async function GET(): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) {
    return NextResponse.json({ onboardingCompleted: false, workspace: null })
  }
  const workspace = workspaceAccess.ctx

  const ws = await db.workspace.findUnique({
    where:  { id: workspace.workspaceId },
    select: {
      onboardingCompleted: true,
      name: true,
      targetIndustry: true,
      targetCompanySize: true,
      sendingDomain: true,
    },
  })

  return NextResponse.json({
    onboardingCompleted: ws?.onboardingCompleted ?? false,
    workspace: ws,
  })
}
