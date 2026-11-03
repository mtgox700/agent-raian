/**
 * GET   /api/security/settings: the workspace's security options.
 * PATCH /api/security/settings: { requireTwoFactor }: owner only, after a
 *       recent verification. Turning it on requires the owner's own second
 *       factor first, so they cannot lock themselves out of the option.
 */
import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { can } from '@/lib/auth/permissions'
import { requireStepUp, type StepUpDeps } from '@/lib/auth/step-up'
import { recordAudit } from '@/lib/audit/audit'

export const runtime = 'nodejs'

const patchSchema = z.object({ requireTwoFactor: z.boolean() })

async function ownTwoFactor(clerkUserId: string): ReturnType<StepUpDeps['twoFactorEnabled']> {
  const client = await clerkClient()
  return (await client.users.getUser(clerkUserId)).twoFactorEnabled
}

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'audit.read')
  if (!access.ok) return accessDenied(access)
  const workspace = await db.workspace.findUnique({ where: { id: access.ctx.workspaceId }, select: { requireTwoFactor: true } })
  return NextResponse.json({
    requireTwoFactor: workspace?.requireTwoFactor ?? false,
    canManage:        can(access.ctx.role, 'security.manage'),
    ownTwoFactor:     await ownTwoFactor(access.ctx.clerkUserId).catch(() => null),
  })
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'security.manage')
  if (!access.ok) return accessDenied(access)

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  // Turning the rule off needs a fresh verification only, so an owner who
  // lost their own second factor can still release the team.
  const stepUp = await requireStepUp(db, access.ctx, {
    recencyOnly: !parsed.data.requireTwoFactor,
    deny: { action: 'security.two_factor', target: { type: 'workspace', id: access.ctx.workspaceId }, req, details: { enabled: parsed.data.requireTwoFactor } },
  })
  if (stepUp) return stepUp
  if (parsed.data.requireTwoFactor && !(await ownTwoFactor(access.ctx.clerkUserId))) {
    return NextResponse.json({
      code:  'OWN_TWO_FACTOR_MISSING',
      error: 'Activez d’abord la double authentification sur votre propre compte (menu de votre compte › Sécurité).',
    }, { status: 409 })
  }

  await db.workspace.update({ where: { id: access.ctx.workspaceId }, data: { requireTwoFactor: parsed.data.requireTwoFactor } })
  await recordAudit(db, access.ctx, {
    action: 'security.two_factor', target: { type: 'workspace', id: access.ctx.workspaceId }, req,
    details: { enabled: parsed.data.requireTwoFactor },
  })
  return NextResponse.json({ ok: true, requireTwoFactor: parsed.data.requireTwoFactor })
}
