/**
 * GET /api/views/a-envoyer: data of the "À envoyer" page (lib/views/a-envoyer).
 * Without lead access the page sends to onboarding, as before:
 * `{ redirect: '/onboarding' }`.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth/access'
import { aEnvoyerView } from '@/lib/views/a-envoyer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'lead.read')
  if (!workspaceAccess.ok) return NextResponse.json({ redirect: '/onboarding' })

  return NextResponse.json(await aEnvoyerView(workspaceAccess.ctx))
}
