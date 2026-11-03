/**
 * POST /api/analyst/ask: one question to the Analyst, as Server-Sent Events.
 *
 * Body: { question: string, conversationId?: string }
 * Events:
 *   progress  { type: 'step', step } | { type: 'tool', name }
 *   answer    { conversationId, messageId, status, text, evidence, quota }
 *   failure   { reason, message }
 *
 * Only the progress streams: the answer is sent once the verifier has
 * passed it. If the browser leaves, the analysis still completes and is
 * saved in the conversation.
 */

import { auth } from '@clerk/nextjs/server'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { askStream } from '@/lib/analyst/http'

export const maxDuration = 300

export async function POST(req: Request) {
  const { userId } = await auth()
  const access = await requireAccess(userId, 'analyst.ask')
  if (!access.ok) return accessDenied(access)
  return askStream(req, access.ctx)
}
