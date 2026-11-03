/**
 * GET    /api/analyst/conversations/:id  the asker's own conversation
 * DELETE /api/analyst/conversations/:id  deletes it, for good
 *
 * Someone else's conversation answers 404, exactly like a missing one.
 */

import { auth } from '@clerk/nextjs/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { conversation, removeConversation } from '@/lib/analyst/http'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'analyst.ask')
  if (!access.ok) return accessDenied(access)
  return conversation(access.ctx, (await params).id)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'analyst.ask')
  if (!access.ok) return accessDenied(access)
  return removeConversation(access.ctx, (await params).id)
}
