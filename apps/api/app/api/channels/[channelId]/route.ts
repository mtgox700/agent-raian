/**
 * DELETE /api/channels/[channelId]: disconnect a LinkedIn/WhatsApp channel.
 * Only its owner or an admin may. Revokes the Unipile account, removes the row.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { ownChannelScope } from '@/lib/auth/scope'
import { deleteUnipileAccount } from '@/lib/multichannel/unipile'
import { requireStepUp } from '@/lib/auth/step-up'
import { recordAudit } from '@/lib/audit/audit'

export const runtime = 'nodejs'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'channel.manage')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const { channelId } = await params
  // A member disconnects only their own account; admins any of the workspace.
  const channel = await db.connectedChannel.findFirst({ where: { id: channelId, ...ownChannelScope(workspace) } })
  if (!channel) {
    return NextResponse.json({ error: 'Canal introuvable' }, { status: 404 })
  }
  const stepUp = await requireStepUp(db, workspace, { deny: { action: 'channel.disconnected', target: { type: 'channel', id: channelId }, req } })
  if (stepUp) return stepUp

  // Best-effort revoke at Unipile (404 tolerated), then drop our row.
  if (channel.unipileAccountId) {
    try {
      await deleteUnipileAccount(channel.unipileAccountId)
    } catch (err) {
      console.warn('[channels/delete] unipile revoke failed (row still removed):',
        err instanceof Error ? err.message : String(err))
    }
  }
  await db.connectedChannel.delete({ where: { id: channelId } })
  await recordAudit(db, workspace, { action: 'channel.disconnected', target: { type: 'channel', id: channelId }, req, details: { provider: channel.provider } })

  return NextResponse.json({ ok: true })
}
