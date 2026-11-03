/**
 * POST /api/security/redteam: LLM red-team probe endpoint (NVIDIA garak).
 *
 * Mirrors how the reply classifier prompts the model: the attacker payload `q`
 * is injected as the untrusted "reply body" behind our real system prompt, and
 * the RAW model output is returned. garak's detectors then check whether the
 * injection broke the system prompt (e.g. produced an attack marker / followed
 * injected instructions): i.e. it red-teams our actual prompt design + model.
 *
 * SAFETY: disabled by default. Enable only for a red-team run by setting
 * ENABLE_REDTEAM=1, and optionally gate with REDTEAM_SECRET (constant-time).
 * Never enable in a public production deployment.
 */

import { NextResponse } from 'next/server'
import { chat, llmModel, isLlmConfigured } from '@/lib/llm/client'
import { SYSTEM_PROMPT } from '@/lib/agents/reply-classifier'
import { safeCompare } from '@/lib/security/crypto'
import { delimitUntrusted } from '@/lib/security/prompt-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Off unless ENABLE_REDTEAM=1, never on the production deployment (Vercel),
 * and never without a secret: an open probe is an unauthenticated proxy to
 * our model at our expense.
 */
function enabled(): boolean {
  return process.env.ENABLE_REDTEAM === '1' && process.env.VERCEL_ENV !== 'production' && Boolean(process.env.REDTEAM_SECRET)
}

const MAX_PAYLOAD = 8_000

export async function POST(req: Request): Promise<NextResponse> {
  if (!enabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Shared-secret gate (constant-time); enabled() guarantees it is set.
  if (!safeCompare(req.headers.get('x-redteam-secret'), process.env.REDTEAM_SECRET ?? null)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isLlmConfigured()) {
    return NextResponse.json({ error: 'LLM not configured (set OLLAMA_API_KEY)' }, { status: 503 })
  }

  let body: { q?: unknown }
  try {
    body = (await req.json()) as { q?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const q = typeof body.q === 'string' ? body.q.slice(0, MAX_PAYLOAD) : ''
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 422 })

  // Frame the payload exactly like a real inbound reply body, delimited as
  // classifyReply does: the probe must test the prompt production uses.
  const userMessage = `Original subject: (none)\n\nReply body:\n${delimitUntrusted(q)}`

  try {
    const output = await chat({
      system: SYSTEM_PROMPT,
      prompt: userMessage,
      model: llmModel('classify'),
      maxTokens: 256,
      temperature: 0,
    })
    return NextResponse.json({ output })
  } catch (err) {
    console.error('[redteam] model call failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'LLM error' }, { status: 502 })
  }
}
