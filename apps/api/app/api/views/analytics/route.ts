/**
 * GET /api/views/analytics: data of the Analytics page (lib/views/analytics).
 * The query string is the page's (?p=30d&c=…&vs=…); a repeated key arrives
 * as an array, as in the page's searchParams.
 * Without workspace access the page sends to onboarding, as before:
 * `{ redirect: '/onboarding' }`.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAccess } from '@/lib/auth/access'
import { analyticsView } from '@/lib/views/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) return NextResponse.json({ redirect: '/onboarding' })

  const search = new URL(req.url).searchParams
  const params: Record<string, string | string[]> = {}
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key)
    params[key] = values.length === 1 ? values[0] : values
  }

  return NextResponse.json(await analyticsView(db, workspaceAccess.ctx, params))
}
