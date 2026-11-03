import type { AnswerStatus, Evidence, ProgressEvent, Quota } from './types'

export interface AnswerEvent {
  conversationId: string
  messageId: string
  status: AnswerStatus
  text: string
  evidence: Evidence[]
  quota: Quota
}

export interface AskHandlers {
  onProgress: (e: ProgressEvent) => void
  onAnswer: (a: AnswerEvent) => void
  onFailure: (message: string, quota?: Quota | null, reason?: string) => void
}

/** POSTs a question and reads the Server-Sent Events of the answer. */
export async function ask(question: string, conversationId: string | null, h: AskHandlers, apiBase = '/api/analyst'): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${apiBase}/ask`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, conversationId }),
    })
  } catch {
    h.onFailure('Connexion perdue : vérifiez votre réseau et réessayez.')
    return
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    h.onFailure(data.error ?? 'L’Analyste n’a pas pu répondre.')
    return
  }

  const interrupted = 'L’analyse a été interrompue. Si elle a abouti, elle apparaîtra dans la conversation.'
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
        else if (event === 'failure') { settled = true; const f = payload as { message: string; reason?: string; quota?: Quota | null }; h.onFailure(f.message, f.quota, f.reason) }
        else if (event === 'error' || event === 'close') { settled = true; h.onFailure(interrupted) }
      }
    }
  } catch {
    // The connection dropped mid-answer: the screen must never stay waiting.
  }
  if (!settled) h.onFailure(interrupted)
}
