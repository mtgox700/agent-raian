/**
 * PATCH /api/workspace/name: renames the workspace shown in the sidebar.
 * Body: { name: string } (2 to 60 characters).
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'

const bodySchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit faire au moins 2 caractères.').max(60, 'Le nom doit faire au plus 60 caractères.'),
})

export async function PATCH(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'settings.manage')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' }, { status: 422 })
  }

  await db.workspace.update({ where: { id: workspace.workspaceId }, data: { name: parsed.data.name } })
  return NextResponse.json({ ok: true, name: parsed.data.name })
}
