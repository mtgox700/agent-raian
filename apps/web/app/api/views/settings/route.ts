/**
 * GET /api/views/settings: data of the Settings page (lib/views/settings).
 * Without a workspace the page shows the FREE plan and no usage, as before.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loadAccess } from '@/lib/auth/access'
import { settingsView } from '@/lib/views/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const access = await loadAccess(userId)
  return NextResponse.json(await settingsView(db, access))
}
