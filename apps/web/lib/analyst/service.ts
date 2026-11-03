/**
 * The Analyst as the product sees it: the monthly quota, the saved
 * conversations (private to their author), and the cost of every model
 * call written to LlmUsage. Routes call this, never run.ts directly.
 */

import type { Plan, Prisma, PrismaClient } from '@prisma/client'
import { anthropicModel, costMicroUsd } from '@/lib/llm/agent'
import type { Scope } from '@/lib/auth/scope'
import { MESSAGES, runAnalyst, type AnalystAnswer, type AnalystEvent, type AnalystModels } from './run'
import { sandboxModel } from './sandbox-model'

/**
 * Questions per workspace per calendar month (UTC). PROVISIONAL: the final
 * values are proposed to Ayoub once the real cost of a question is measured
 * (E3-d). Pro gets a preview (spec §12).
 */
export const MONTHLY_QUESTIONS: Record<Plan, number> = {
  FREE: 0,
  STARTER: 0,
  PRO: 3,
  BUSINESS: 100,
  ENTERPRISE: 400,
}

export const ANALYST_MODEL = 'claude-opus-5-5'

export type ModelMode = 'anthropic' | 'sandbox' | 'none'

/** The real model when a key is set; the scripted one only outside production, on request. */
export function modelMode(env: Record<string, string | undefined> = process.env): ModelMode {
  // An explicit sandbox request wins locally, even with a key: tests stay free.
  // Never on Vercel, never in a production build.
  if (env.ANALYST_SANDBOX_MODEL === '1' && !env.VERCEL_ENV && env.NODE_ENV !== 'production') return 'sandbox'
  // Paid answers need the founder's go: the key is already set for lead
  // scoring, so it alone must not switch the Analyst on (ANALYST_LIVE=1).
  if (env.ANTHROPIC_API_KEY && env.ANALYST_LIVE === '1') return 'anthropic'
  return 'none'
}

export function analystModels(mode = modelMode()): AnalystModels | null {
  if (mode === 'anthropic') {
    const m = anthropicModel(ANALYST_MODEL)
    return { orchestrator: m, devil: m }
  }
  if (mode === 'sandbox') return { orchestrator: sandboxModel(), devil: sandboxModel() }
  return null
}

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export interface QuotaState { used: number; limit: number; remaining: number; resetsAt: Date }

type Db = PrismaClient | Prisma.TransactionClient

/** A reservation still running counts; one older than this was abandoned. */
const PENDING_TTL_MS = 10 * 60_000

/**
 * Questions used this month, from the ledger (AnalystQuestion), never from
 * the conversations: deleting a conversation refunds nothing. A question
 * that failed before any paid call is free; one that failed after is not.
 */
export async function quotaState(db: Db, workspaceId: string, plan: Plan, now = new Date()): Promise<QuotaState> {
  const used = await db.analystQuestion.count({
    where: {
      workspaceId, createdAt: { gte: monthStart(now) },
      OR: [{ status: 'counted' }, { status: 'pending', createdAt: { gte: new Date(now.getTime() - PENDING_TTL_MS) } }],
    },
  })
  const limit = MONTHLY_QUESTIONS[plan]
  const next = monthStart(now)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { used, limit, remaining: Math.max(0, limit - used), resetsAt: next }
}

export function conversationTitle(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim()
  return flat.length <= 80 ? flat : `${flat.slice(0, 77).trimEnd()}…`
}

export type AskResult =
  | { ok: true; conversationId: string; messageId: string; answer: AnalystAnswer; latencyMs: number }
  | { ok: false; reason: 'quota' | 'unavailable' | 'not_found'; quota?: QuotaState }

export interface AskInput {
  db: PrismaClient
  scope: Scope
  plan: Plan
  question: string
  conversationId?: string | null
  models?: AnalystModels | null
  onEvent?: (e: AnalystEvent) => void
  now?: Date
}

type History = Array<{ role: 'user' | 'assistant'; content: string }>

/**
 * Past turns as the model needs them: starting with the user, alternating,
 * and without the old [T3] references, which point at results that no
 * longer exist (each question restarts its tool session at T1).
 */
export function cleanHistory(messages: Array<{ role: string; content: string; status?: string | null }>): History {
  const out: History = []
  for (const m of messages) {
    if (m.role === 'assistant' && m.status === 'pending') continue
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const content = role === 'assistant' ? m.content.replace(/\s*\[T\d+\]/g, '') : m.content
    if (!content.trim()) continue
    if (out.length === 0 && role === 'assistant') continue
    const last = out[out.length - 1]
    if (last && last.role === role) last.content = `${last.content}\n\n${content}`
    else out.push({ role, content })
  }
  // The question being asked is appended by the run: end on an answer.
  while (out.length && out[out.length - 1].role === 'user') out.pop()
  return out
}

export async function askAnalyst(input: AskInput): Promise<AskResult> {
  const { db, scope } = input
  const models = input.models === undefined ? analystModels() : input.models
  if (!models) return { ok: false, reason: 'unavailable' }

  let history: History = []
  if (input.conversationId) {
    // Only the author's own conversation, in this workspace.
    const conv = await db.analystConversation.findFirst({
      where: { id: input.conversationId, workspaceId: scope.workspaceId, userId: scope.userId },
      select: { messages: { orderBy: { createdAt: 'asc' }, select: { role: true, content: true, status: true } } },
    })
    if (!conv) return { ok: false, reason: 'not_found' }
    history = cleanHistory(conv.messages)
  }

  // Reserve the question before any model call, under a workspace lock:
  // parallel requests queue here and the last one sees the quota spent.
  type Reservation = { quota: QuotaState } | { ledgerId: string; conversationId: string }
  const reserved = await db.$transaction(async (tx): Promise<Reservation> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`analyst:${scope.workspaceId}`}))`
    const quota = await quotaState(tx, scope.workspaceId, input.plan, input.now)
    if (quota.remaining <= 0) return { quota }
    const ledger = await tx.analystQuestion.create({ data: { workspaceId: scope.workspaceId, userId: scope.userId }, select: { id: true } })
    const conversationId: string = input.conversationId ?? (await tx.analystConversation.create({
      data: { workspaceId: scope.workspaceId, userId: scope.userId, title: conversationTitle(input.question) },
      select: { id: true },
    })).id
    await tx.analystMessage.create({ data: { conversationId, role: 'user', content: input.question } })
    return { ledgerId: ledger.id, conversationId }
  })
  if (!('ledgerId' in reserved)) return { ok: false, reason: 'quota', quota: reserved.quota }
  const { ledgerId, conversationId } = reserved

  const started = Date.now()
  const spent: AnalystAnswer['usage'] = []
  let answer: AnalystAnswer
  try {
    answer = await runAnalyst({ question: input.question, history, ctx: { db, scope, now: input.now }, models, onEvent: input.onEvent, usageSink: spent })
  } catch (err) {
    console.error('[analyst] run failed:', err instanceof Error ? err.message : String(err))
    answer = { status: 'error', text: MESSAGES.error, evidence: [], usage: [...spent], objections: [], faults: [], devil: 'ignore', revised: false }
  }
  const latencyMs = Date.now() - started
  // Whatever happened, every paid call is recorded and counted.
  const paid = spent.length > 0

  const [message] = await db.$transaction([
    db.analystMessage.create({
      data: {
        conversationId, role: 'assistant', content: answer.text, status: answer.status, latencyMs,
        evidence: answer.evidence.map((r) => ({ ref: r.ref, tool: r.tool, data: r.data })) as Prisma.InputJsonValue,
      },
      select: { id: true },
    }),
    db.analystConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    db.analystQuestion.update({ where: { id: ledgerId }, data: { status: answer.status === 'error' && !paid ? 'free' : 'counted' } }),
    ...(models.orchestrator.name.startsWith('claude-') && paid ? [db.llmUsage.createMany({
      data: spent.map((u) => ({
        workspaceId: scope.workspaceId, userId: scope.userId, task: u.task, model: u.model,
        inputTokens: u.inputTokens, outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens,
        costMicroUsd: costMicroUsd(u),
      })),
    })] : []),
  ])
  return { ok: true, conversationId, messageId: message.id, answer, latencyMs }
}

export async function listConversations(db: PrismaClient, scope: Scope) {
  return db.analystConversation.findMany({
    where: { workspaceId: scope.workspaceId, userId: scope.userId },
    orderBy: { updatedAt: 'desc' }, take: 50,
    select: { id: true, title: true, updatedAt: true },
  })
}

export async function getConversation(db: PrismaClient, scope: Scope, id: string) {
  return db.analystConversation.findFirst({
    where: { id, workspaceId: scope.workspaceId, userId: scope.userId },
    select: {
      id: true, title: true,
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, status: true, evidence: true, createdAt: true } },
    },
  })
}

/** Deletes the author's own conversation; false when it is not theirs. */
export async function deleteConversation(db: PrismaClient, scope: Scope, id: string): Promise<boolean> {
  const res = await db.analystConversation.deleteMany({ where: { id, workspaceId: scope.workspaceId, userId: scope.userId } })
  return res.count > 0
}
