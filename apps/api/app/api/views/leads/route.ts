/**
 * GET /api/views/leads: data of the Leads page (lib/views/leads).
 * Without lead access the page shows an empty base, as before.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAccess } from '@/lib/auth/access'
import { emptyLeadsView, leadsView } from '@/lib/views/leads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'lead.read')
  if (!workspaceAccess.ok) return NextResponse.json(emptyLeadsView())

  return NextResponse.json(await leadsView(db, workspaceAccess.ctx))
}
