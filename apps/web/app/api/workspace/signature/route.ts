/**
 * GET/PUT /api/workspace/signature: pro email signature (Trust Pack).
 * Stored as JSON on Workspace.emailSignature; appended to sequence emails.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { signatureInputSchema, parseSignature } from '@/lib/email/signature'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const row = await db.workspace.findUnique({
    where:  { id: workspace.workspaceId },
    select: { emailSignature: true },
  })
  return NextResponse.json({ signature: parseSignature(row?.emailSignature) })
}

export async function PUT(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'settings.manage')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const parsed = signatureInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides' },
      { status: 422 },
    )
  }

  await db.workspace.update({
    where: { id: workspace.workspaceId },
    data:  { emailSignature: parsed.data },
  })
  return NextResponse.json({ ok: true, signature: parsed.data })
}
