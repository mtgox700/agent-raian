/**
 * One question to the Analyst through the contract (analyst.ask, a
 * Server-Sent Events stream): progress events, then an answer or a failure.
 * Read the same way as body n°1: blank-line separated `event:`/`data:` blocks.
 */
import { ApiError } from '@phantera/sdk'
import { api } from '@/lib/front/api'
import { analystCopy } from '@/lib/copy/analyst'
import type { AnswerEvent, ProgressEvent, Quota } from '@/lib/front/types-analyst'

export interface AskHandlers {
  onProgress: (e: ProgressEvent) => void
  onAnswer: (a: AnswerEvent) => void
  onFailure: (message: string, quota?: Quota | null, reason?: string) => void
}

const t = analystCopy.notices

export async function ask(question: string, conversationId: string | null, h: AskHandlers): Promise<void> {
  let res: Response
  try {
    res = await api.call('analyst.ask', { body: { question, ...(conversationId ? { conversationId } : {}) } })
  } catch (err) {
    h.onFailure(err instanceof ApiError ? (err.body?.error ?? t.noAnswer) : t.offline)
    return
  }
  if (!res.body) {
    h.onFailure(t.noAnswer)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let settled = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      // A proxy may rewrite line endings; the protocol only needs blank lines.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let cut: number
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        const event = /^event: (.+)$/m.exec(chunk)?.[1]
        const data = /^data: (.+)$/m.exec(chunk)?.[1]
        if (!event || !data) continue
        let payload: unknown
        try { payload = JSON.parse(data) } catch { continue }
        if (event === 'progress') h.onProgress(payload as ProgressEvent)
        else if (event === 'answer') { settled = true; h.onAnswer(payload as AnswerEvent) }
        else if (event === 'failure') {
          settled = true
          const f = payload as { message: string; reason?: string; quota?: Quota | null }
          h.onFailure(f.message, f.quota, f.reason)
        } else if (event === 'error' || event === 'close') { settled = true; h.onFailure(t.interrupted) }
      }
    }
  } catch {
    // The connection dropped mid-answer: the screen must never stay waiting.
  }
  if (!settled) h.onFailure(t.interrupted)
}
