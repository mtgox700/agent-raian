/**
 * GET /api/touches/queue : WhatsApp/SMS messages drafted by sequence steps,
 * waiting for the user to send them from their phone ("À envoyer").
 * ?count=1 returns only the number (sidebar badge).
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { countQueue, listQueue } from '@/lib/touch/touch.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 })
  const workspaceAccess = await requireAccess(userId, 'lead.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  if (new URL(req.url).searchParams.get('count') === '1') {
    return NextResponse.json({ count: await countQueue(workspace) })
  }
  const queue = await listQueue(workspace)
  return NextResponse.json({ ok: true, ...queue })
}
