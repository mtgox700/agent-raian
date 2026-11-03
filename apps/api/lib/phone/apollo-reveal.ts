/**
 * Professional phone lookup through Apollo (people/match, reveal_phone_number).
 *
 * Each lookup costs Phantera's Apollo credits (8 when a mobile is found), so
 * it runs at most once per lead and under two monthly caps read from the
 * environment. The platform cap defaults to 0: nothing is spent until the
 * founder sets a budget.
 *
 * Apollo answers asynchronously: the numbers are POSTed to our webhook a few
 * minutes later. Apollo does not sign its webhooks, so the URL carries a
 * one-time random token; only its hash is stored.
 *
 * Never log a request URL here: the webhook token travels in it.
 */

import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { normalizePhone } from '@/lib/phone/phone'

const APOLLO_MATCH_URL = 'https://api.apollo.io/api/v1/people/match'
const DEFAULT_WORKSPACE_MONTHLY_CAP = 25
const REQUEST_TIMEOUT_MS = 20_000
/** Lookups started by one drip pass, so the pass stays well inside its time budget. */
const MAX_SEQUENCE_REVEALS_PER_PASS = 3
/** Short timeout inside the drip: an unanswered call still gets its webhook. */
const SEQUENCE_TIMEOUT_MS = 8_000

export type RevealTrigger = 'MANUAL' | 'SEQUENCE'
export type RevealStatus = 'PENDING' | 'FOUND' | 'NOT_FOUND' | 'REJECTED'

export type RevealError =
  | 'DISABLED'
  | 'NOT_CONFIGURED'
  | 'LEAD_NOT_FOUND'
  | 'NO_APOLLO_ID'
  | 'HAS_PHONE'
  | 'DO_NOT_CONTACT'
  | 'ALREADY_REQUESTED'
  | 'PLATFORM_CAP'
  | 'WORKSPACE_CAP'
  | 'APOLLO_ERROR'

export const REVEAL_ERROR_MESSAGES: Record<RevealError, string> = {
  DISABLED:          'La recherche de numéros n’est pas encore activée sur Phantera.',
  NOT_CONFIGURED:    'La recherche de numéros n’est pas disponible pour le moment.',
  LEAD_NOT_FOUND:    'Lead introuvable.',
  NO_APOLLO_ID:      'Ce lead ne vient pas d’Apollo : saisissez son numéro à la main.',
  HAS_PHONE:         'Ce lead a déjà un numéro.',
  DO_NOT_CONTACT:    'Ce lead ne doit plus être contacté.',
  ALREADY_REQUESTED: 'Le numéro de ce lead a déjà été recherché.',
  PLATFORM_CAP:      'Le volume de recherches de numéros du mois est atteint.',
  WORKSPACE_CAP:     'Vous avez atteint votre volume de recherches de numéros pour ce mois.',
  APOLLO_ERROR:      'Apollo n’a pas pu lancer la recherche. Réessayez plus tard.',
}

export interface RevealCaps {
  platform: number
  workspace: number
}

function readCap(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function revealCaps(env: NodeJS.ProcessEnv = process.env): RevealCaps {
  return {
    platform:  readCap(env.APOLLO_PHONE_REVEALS_PER_MONTH, 0),
    workspace: readCap(env.APOLLO_PHONE_REVEALS_PER_WORKSPACE_MONTH, DEFAULT_WORKSPACE_MONTHLY_CAP),
  }
}

export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function webhookBaseUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.phantera-tn.com').replace(/\/+$/, '')
  // Apollo only calls public HTTPS endpoints.
  return base.startsWith('https://') ? base : null
}

/**
 * Every lookup counts against the caps except the ones Apollo refused (4xx):
 * a timeout or a 5xx may still have been charged, so it stays PENDING and
 * counted, and its webhook is still accepted when it arrives.
 */
const COUNTED = { status: { not: 'REJECTED' } }

/** Past this, a lookup Apollo never answered is shown as "no number". */
export const PENDING_EXPIRY_MS = 2 * 60 * 60 * 1000

/** Serialises cap checks across all workspaces (the platform cap is shared). */
const CAP_LOCK_KEY = 718_204_551

type Tx = Pick<PrismaClient, 'phoneReveal' | '$executeRaw'>

export async function revealUsage(db: Pick<PrismaClient, 'phoneReveal'>, workspaceId: string, now = new Date()) {
  const since = startOfMonthUtc(now)
  const [platform, workspace] = await Promise.all([
    db.phoneReveal.count({ where: { ...COUNTED, createdAt: { gte: since } } }),
    db.phoneReveal.count({ where: { ...COUNTED, workspaceId, createdAt: { gte: since } } }),
  ])
  return { platform, workspace }
}

export async function remainingReveals(db: PrismaClient, workspaceId: string, now = new Date()): Promise<number> {
  const caps = revealCaps()
  if (caps.platform === 0) return 0
  const used = await revealUsage(db, workspaceId, now)
  return Math.max(0, Math.min(caps.platform - used.platform, caps.workspace - used.workspace))
}

type RequestResult = { ok: true; revealId: string } | { ok: false; error: RevealError }

interface RequestOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** Starts one paid lookup for a lead, if every guard allows it. */
export async function requestPhoneReveal(
  db: PrismaClient,
  input: { workspaceId: string; leadId: string; trigger: RevealTrigger },
  options: RequestOptions = {},
): Promise<RequestResult> {
  const { fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = options
  const caps = revealCaps()
  if (caps.platform === 0) return { ok: false, error: 'DISABLED' }
  const apiKey = process.env.APOLLO_API_KEY
  const base = webhookBaseUrl()
  if (!apiKey || !base) return { ok: false, error: 'NOT_CONFIGURED' }

  const lead = await db.lead.findFirst({
    where:  { id: input.leadId, workspaceId: input.workspaceId },
    select: { id: true, apolloId: true, phone: true, doNotContact: true },
  })
  if (!lead) return { ok: false, error: 'LEAD_NOT_FOUND' }
  if (!lead.apolloId) return { ok: false, error: 'NO_APOLLO_ID' }
  if (lead.phone) return { ok: false, error: 'HAS_PHONE' }
  if (lead.doNotContact) return { ok: false, error: 'DO_NOT_CONTACT' }
  const apolloId = lead.apolloId

  const token = randomBytes(24).toString('hex')
  const reserved = await reserveLookup(db, caps, {
    workspaceId: input.workspaceId,
    leadId:      lead.id,
    apolloId,
    trigger:     input.trigger,
    tokenHash:   hashToken(token),
  })
  if (!reserved.ok) return reserved

  const url = new URL(APOLLO_MATCH_URL)
  url.searchParams.set('id', apolloId)
  url.searchParams.set('reveal_phone_number', 'true')
  url.searchParams.set('reveal_personal_emails', 'false')
  url.searchParams.set('webhook_url', `${base}/api/webhooks/apollo-phone?token=${token}`)

  try {
    const res = await fetchImpl(url.toString(), {
      method:  'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      signal:  AbortSignal.timeout(timeoutMs),
    })
    if (res.status >= 400 && res.status < 500) {
      const text = (await res.text().catch(() => '')).slice(0, 200)
      console.warn(`[apollo-phone] match refused ${res.status}: ${text}`)
      await db.phoneReveal.update({
        where: { id: reserved.revealId },
        data:  { status: 'REJECTED', error: `HTTP ${res.status}`, completedAt: new Date() },
      })
      return { ok: false, error: 'APOLLO_ERROR' }
    }
    if (!res.ok) {
      // Apollo may have taken the request: keep it PENDING (and counted).
      console.warn(`[apollo-phone] match ${res.status}, waiting for the webhook`)
      await db.phoneReveal.update({ where: { id: reserved.revealId }, data: { error: `HTTP ${res.status}` } })
      return { ok: true, revealId: reserved.revealId }
    }
    const body = await res.json().catch(() => ({})) as { request_id?: unknown }
    if (typeof body.request_id === 'string' || typeof body.request_id === 'number') {
      await db.phoneReveal.update({ where: { id: reserved.revealId }, data: { requestId: String(body.request_id) } })
    }
    return { ok: true, revealId: reserved.revealId }
  } catch (err) {
    console.warn('[apollo-phone] match unanswered, waiting for the webhook:', err instanceof Error ? err.name : err)
    await db.phoneReveal
      .update({ where: { id: reserved.revealId }, data: { error: 'NO_RESPONSE' } })
      .catch(() => undefined)
    return { ok: true, revealId: reserved.revealId }
  }
}

/**
 * Checks the caps and records the lookup in one transaction, under an
 * advisory lock: parallel requests for different leads cannot all pass a
 * count taken before any of them was inserted.
 */
async function reserveLookup(
  db: PrismaClient,
  caps: RevealCaps,
  row: { workspaceId: string; leadId: string; apolloId: string; trigger: RevealTrigger; tokenHash: string },
): Promise<{ ok: true; revealId: string } | { ok: false; error: RevealError }> {
  return db.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CAP_LOCK_KEY})`

    const previous = await tx.phoneReveal.findUnique({ where: { leadId: row.leadId }, select: { id: true, status: true } })
    if (previous && previous.status !== 'REJECTED') return { ok: false as const, error: 'ALREADY_REQUESTED' as const }

    const usage = await revealUsage(tx, row.workspaceId)
    if (usage.platform >= caps.platform) return { ok: false as const, error: 'PLATFORM_CAP' as const }
    if (usage.workspace >= caps.workspace) return { ok: false as const, error: 'WORKSPACE_CAP' as const }

    const data = { ...row, status: 'PENDING', requestId: null, credits: null, error: null, completedAt: null, createdAt: new Date() }
    const saved = previous
      ? await tx.phoneReveal.update({ where: { id: previous.id }, data })
      : await tx.phoneReveal.create({ data })
    return { ok: true as const, revealId: saved.id }
  })
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

const phoneSchema = z.object({
  sanitized_number: z.string().max(40).nullish(),
  raw_number:       z.string().max(40).nullish(),
  type_cd:          z.string().max(40).nullish(),
  status_cd:        z.string().max(40).nullish(),
  dnc_status_cd:    z.string().max(40).nullish(),
}).passthrough()

const webhookSchema = z.object({
  credits_consumed: z.number().nullish(),
  people: z.array(z.object({
    id:            z.string().max(64).nullish(),
    phone_numbers: z.array(phoneSchema).max(50).nullish(),
  }).passthrough()).max(20).nullish(),
}).passthrough()

export type ApolloPhone = z.infer<typeof phoneSchema>

const TYPE_RANK: Record<string, number> = { mobile: 0, work_direct: 1 }

function onDoNotCallList(dnc: string | null | undefined): boolean {
  if (!dnc) return false
  return !/^(not_|unknown|none|unchecked)/i.test(dnc)
}

/**
 * The number WhatsApp and SMS can reach: a mobile first, then a direct work
 * line. Invalid numbers and numbers on a do-not-call list are never kept.
 */
export function pickPhone(numbers: ApolloPhone[]): string | null {
  const usable = numbers
    .filter((n) => !/invalid|disconnected/i.test(n.status_cd ?? ''))
    .filter((n) => !onDoNotCallList(n.dnc_status_cd))
    .filter((n) => (n.type_cd ?? '') in TYPE_RANK)
    .map((n) => ({ rank: TYPE_RANK[n.type_cd ?? ''], digits: normalizePhone(n.sanitized_number ?? n.raw_number ?? '') }))
    .filter((n): n is { rank: number; digits: string } => n.digits !== null)
    .sort((a, b) => a.rank - b.rank)
  return usable[0]?.digits ?? null
}

export type WebhookOutcome = 'UNKNOWN_TOKEN' | 'ALREADY_DONE' | 'FOUND' | 'NOT_FOUND' | 'INVALID'

export async function handleRevealWebhook(db: PrismaClient, token: string, payload: unknown): Promise<WebhookOutcome> {
  if (!/^[a-f0-9]{48}$/.test(token)) return 'UNKNOWN_TOKEN'
  const reveal = await db.phoneReveal.findUnique({
    where:  { tokenHash: hashToken(token) },
    select: { id: true, status: true, apolloId: true, leadId: true },
  })
  if (!reveal) return 'UNKNOWN_TOKEN'
  if (reveal.status !== 'PENDING') return 'ALREADY_DONE'

  const parsed = webhookSchema.safeParse(payload)
  if (!parsed.success) return 'INVALID'
  const people = parsed.data.people ?? []
  const person = people.find((p) => p.id === reveal.apolloId) ?? (people.length === 1 ? people[0] : undefined)
  const phone = pickPhone(person?.phone_numbers ?? [])
  const credits = typeof parsed.data.credits_consumed === 'number' ? Math.round(parsed.data.credits_consumed) : null

  // One transaction: a failure after the claim would otherwise lose a number
  // already paid for, since Apollo's retry would find the lookup done.
  return db.$transaction(async (tx: Pick<PrismaClient, 'phoneReveal' | 'lead'>) => {
    // Apollo may call twice: only the first delivery flips PENDING.
    const claimed = await tx.phoneReveal.updateMany({
      where: { id: reveal.id, status: 'PENDING' },
      data:  { status: phone ? 'FOUND' : 'NOT_FOUND', credits, completedAt: new Date() },
    })
    if (claimed.count === 0) return 'ALREADY_DONE' as const
    if (!phone) return 'NOT_FOUND' as const

    // Never overwrite a number the user typed meanwhile, and never give a
    // number to a lead who asked not to be contacted.
    await tx.lead.updateMany({
      where: { id: reveal.leadId, phone: null, doNotContact: false },
      data:  { phone, phoneSource: 'APOLLO' },
    })
    return 'FOUND' as const
  })
}

/** Status shown to the user: a lookup Apollo never answered ends as "no number". */
export function displayStatus(reveal: { status: string; createdAt: Date } | null, now = new Date()): string | null {
  if (!reveal) return null
  if (reveal.status === 'PENDING' && now.getTime() - reveal.createdAt.getTime() > PENDING_EXPIRY_MS) return 'NOT_FOUND'
  return reveal.status
}

// ─── Sequences ────────────────────────────────────────────────────────────────

/**
 * After an email or LinkedIn step goes out, looks up the number of leads whose
 * sequence still has a WhatsApp or SMS step ahead, so it is known by the day
 * the step comes due. Every guard of requestPhoneReveal still applies; calls
 * run side by side with a short timeout so the drip pass keeps its budget.
 */
export async function revealForUpcomingPhoneSteps(
  db: PrismaClient,
  sent: Array<{ leadId: string; campaignId: string; stepId: string; workspaceId: string }>,
): Promise<number> {
  if (sent.length === 0 || revealCaps().platform === 0) return 0
  const campaignIds = [...new Set(sent.map((s) => s.campaignId))]
  const steps = await db.campaignEmailStep.findMany({
    where:  { campaignId: { in: campaignIds } },
    select: { id: true, campaignId: true, position: true, channel: true },
  })
  const positionOf = new Map(steps.map((s) => [s.id, s.position]))
  const phoneStepAhead = (campaignId: string, position: number) =>
    steps.some((s) => s.campaignId === campaignId && s.position > position && (s.channel === 'WHATSAPP' || s.channel === 'SMS'))

  const candidates = sent
    .filter((s) => {
      const position = positionOf.get(s.stepId)
      return position !== undefined && phoneStepAhead(s.campaignId, position)
    })
    .slice(0, MAX_SEQUENCE_REVEALS_PER_PASS)

  const results = await Promise.allSettled(candidates.map((s) =>
    requestPhoneReveal(db, { workspaceId: s.workspaceId, leadId: s.leadId, trigger: 'SEQUENCE' }, { timeoutMs: SEQUENCE_TIMEOUT_MS }),
  ))
  return results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
}
