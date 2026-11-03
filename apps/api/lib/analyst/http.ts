/**
 * The Analyst's HTTP handlers, once authorised. The routes under
 * app/api/analyst do the authentication (Clerk + requireAccess('analyst.ask'))
 * and hand the access context here; nothing below trusts the request for
 * who is asking.
 */

import { NextResponse } from 'next/server'
import type { Plan } from '@prisma/client'
import { db } from '@/lib/db'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { limitAll } from '@/lib/security/shared-rate-limit'
import { createSSEStream } from '@/lib/sse/stream'
import { MAX_QUESTION_CHARS } from './run'
import { askAnalyst, deleteConversation, getConversation, listConversations, modelMode, MONTHLY_QUESTIONS, quotaState } from './service'
import { suggestions, type Suggestion } from './suggestions'

export type AnalystAccess = Scope & { plan: Plan }

const NOT_FOUND = { error: 'Conversation introuvable.' }

const FAILURES = {
  quota: 'Le quota de questions de ce mois est atteint pour votre espace.',
  unavailable: 'L’Analyste n’est pas encore disponible sur cet environnement.',
  not_found: 'Cette conversation n’existe plus.',
} as const

function bad(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export async function overview(ctx: AnalystAccess): Promise<Response> {
  const [quota, conversations, campaigns] = await Promise.all([
    quotaState(db, ctx.workspaceId, ctx.plan),
    listConversations(db, ctx),
    // For the compare mode: the campaigns the asker can see, nothing more.
    db.campaign.findMany({ where: campaignScope(ctx), select: { id: true, name: true }, orderBy: { updatedAt: 'desc' }, take: 50 }),
  ])
  return NextResponse.json({ mode: modelMode(), plan: ctx.plan, quota, conversations, campaigns, suggestions: DEFAULT_SUGGESTIONS })
}

/** Shown at once; the diagnosis-based ones replace them when they arrive. */
const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { tone: 'neutre', label: 'Quelles campagnes sont bloquées ?', question: 'Quelles campagnes sont bloquées en ce moment, et pourquoi ?' },
  { tone: 'neutre', label: 'Que changer cette semaine ?', question: 'Que dois-je changer cette semaine ?' },
]

const SUGGESTION_TTL_MS = 5 * 60_000
const suggestionCache = new Map<string, { at: number; value: Suggestion[] }>()

/**
 * Suggestions read every live campaign's facts: seconds of work, so they
 * load after the screen and are kept 5 minutes per person (per instance).
 */
const inFlight = new Map<string, Promise<Suggestion[]>>()

export async function suggested(ctx: AnalystAccess): Promise<Response> {
  // Only for workspaces that can ask, and not a free way to load the database.
  if (MONTHLY_QUESTIONS[ctx.plan] === 0) return NextResponse.json({ suggestions: [] })
  const key = `${ctx.workspaceId}:${ctx.userId}:${ctx.role}`
  const hit = suggestionCache.get(key)
  if (hit && Date.now() - hit.at < SUGGESTION_TTL_MS) return NextResponse.json({ suggestions: hit.value })
  const throttle = await limitAll([{ key: `user:${ctx.userId}`, opts: { windowSec: 3600, max: 30, scope: 'analyst-suggestions' } }])
  if (!throttle.allowed) return NextResponse.json({ suggestions: DEFAULT_SUGGESTIONS })

  // Concurrent first loads share one computation.
  let job = inFlight.get(key)
  if (!job) {
    job = suggestions(db, ctx).finally(() => inFlight.delete(key))
    inFlight.set(key, job)
  }
  try {
    const value = await job
    if (suggestionCache.size > 1_000) suggestionCache.clear()
    suggestionCache.set(key, { at: Date.now(), value })
    return NextResponse.json({ suggestions: value })
  } catch (err) {
    console.error('[analyst] suggestions failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ suggestions: DEFAULT_SUGGESTIONS })
  }
}

export async function askStream(req: Request, ctx: AnalystAccess): Promise<Response> {
  let body: { question?: unknown; conversationId?: unknown }
  try { body = await req.json() } catch { return bad('Requête illisible.', 400) }
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const conversationId = typeof body.conversationId === 'string' && body.conversationId ? body.conversationId : null
  if (question.length < 3) return bad('Posez une question d’au moins quelques mots.', 400)
  if (question.length > MAX_QUESTION_CHARS) return bad(`Question trop longue (${MAX_QUESTION_CHARS} caractères au plus).`, 400)

  if (MONTHLY_QUESTIONS[ctx.plan] === 0) {
    return bad('L’Analyste est inclus à partir de la formule Pro.', 402, { upgradeUrl: '/dashboard/settings?tab=billing', reason: 'analyst_plan' })
  }
  // One question can cost several model calls: a member cannot hammer it.
  const throttle = await limitAll([
    { key: `user:${ctx.userId}`, opts: { windowSec: 3600, max: 30, scope: 'analyst-ask' } },
    { key: `ws:${ctx.workspaceId}`, opts: { windowSec: 3600, max: 120, scope: 'analyst-ask' } },
  ])
  if (!throttle.allowed) return bad('Trop de questions d’affilée : réessayez dans quelques minutes.', 429)

  return createSSEStream(async (send) => {
    const result = await askAnalyst({
      db, scope: ctx, plan: ctx.plan, question, conversationId,
      onEvent: (e) => send('progress', e),
    })
    if (!result.ok) {
      send('failure', { reason: result.reason, message: FAILURES[result.reason], quota: result.quota ?? null })
      return
    }
    send('answer', {
      conversationId: result.conversationId,
      messageId: result.messageId,
      status: result.answer.status,
      text: result.answer.text,
      evidence: result.answer.evidence.map((r) => ({ ref: r.ref, tool: r.tool, data: r.data })),
      quota: await quotaState(db, ctx.workspaceId, ctx.plan),
    })
  }, 290_000)
}

export async function conversation(ctx: AnalystAccess, id: string): Promise<Response> {
  const found = await getConversation(db, ctx, id)
  return found ? NextResponse.json({ conversation: found }) : NextResponse.json(NOT_FOUND, { status: 404 })
}

export async function removeConversation(ctx: AnalystAccess, id: string): Promise<Response> {
  return (await deleteConversation(db, ctx, id))
    ? NextResponse.json({ deleted: true })
    : NextResponse.json(NOT_FOUND, { status: 404 })
}
