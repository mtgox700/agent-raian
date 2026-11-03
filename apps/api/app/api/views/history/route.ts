/**
 * GET /api/views/history: data of the History page (lib/views/history).
 * Without workspace access the page shows an empty timeline, as before.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAccess } from '@/lib/auth/access'
import { historyView } from '@/lib/views/history'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) return NextResponse.json({ events: [] })

  return NextResponse.json(await historyView(db, workspaceAccess.ctx))
}
