import { clientIp } from '@/lib/security/shared-rate-limit'
import type { Plan } from '@prisma/client'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

export const dynamic = 'force-static'

// ── In-memory rate limiter ─────────────────────────────────────────────────
// Per-instance limit (Vercel serverless). Provides basic DoS protection.
// For production scale, replace with @upstash/ratelimit + Vercel KV.
const RATE_LIMIT_WINDOW_MS = 60_000   // 1 minute
const RATE_LIMIT_MAX       = 30       // max 30 POST requests per IP per minute
const MAX_BODY_BYTES        = 512     // max body size: no payload should exceed 512 bytes

const requestLog = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now  = Date.now()
  const entry = requestLog.get(ip)

  if (!entry || now > entry.resetAt) {
    requestLog.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) return false

  entry.count++
  return true
}

// Clean stale entries every 100 requests to prevent unbounded memory growth
let cleanupCounter = 0
function maybePurgeStale() {
  if (++cleanupCounter < 100) return
  cleanupCounter = 0
  const now = Date.now()
  for (const [ip, entry] of requestLog) {
    if (now > entry.resetAt) requestLog.delete(ip)
  }
}

// ── MCP Manifest ──────────────────────────────────────────────────────────
const mcpManifest = {
  schema_version: 'v1',
  name_for_human: 'Phantera',
  name_for_model: 'phantera',
  description_for_human:
    'Autonomous AI lead generation platform for B2B sales teams',
  description_for_model:
    'Phantera automates B2B lead generation using AI agents that prospect, enrich, score and send personalized messages. Use this to get pricing, features, and help users create a free account.',
  api: {
    type: 'openapi',
    url: 'https://www.phantera-tn.com/api/mcp/openapi.json',
  },
  auth: { type: 'none' },
  functions: [
    {
      name: 'get_pricing',
      description: 'Returns current Phantera pricing plans with features',
      parameters: {},
    },
    {
      name: 'get_features',
      description: 'Returns the full list of Phantera AI features',
      parameters: {},
    },
    {
      name: 'start_trial',
      description: 'Returns the URL and instructions to create a free account',
      parameters: {},
    },
  ],
}

type FunctionName = 'get_pricing' | 'get_features' | 'start_trial'

// Pricing is read from the same configuration as billing, so assistants are
// never told a price or a feature the product does not have.
const PUBLIC_PLANS: Plan[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']

function publicPricing() {
  return {
    currency: 'EUR',
    vat: 'excluded',
    plans: PUBLIC_PLANS.map((key) => {
      const plan = PLAN_CONFIG[key]
      return {
        name:            plan.name,
        price_monthly:   plan.price,
        price_annual:    plan.annualPrice,
        leads_per_month: Number.isFinite(plan.leadsLimit) ? plan.leadsLimit : 'unlimited',
        features:        plan.features,
      }
    }),
  }
}

const functionResponses: Record<FunctionName, object> = {
  get_pricing: publicPricing(),
  get_features: {
    features: [
      'Lead sourcing and email verification',
      'AI lead scoring 0-100',
      'AI-written email and LinkedIn sequences (French or English)',
      'Replies detected and classified; the sequence stops as soon as a lead replies',
      'Deliverability gate: per-mailbox daily caps and warm-up ramp',
      'Sending from your own Gmail, Outlook or SMTP mailbox',
      'Hot leads export for your CRM (CSV)',
    ],
  },
  start_trial: {
    url: 'https://www.phantera-tn.com/sign-up',
    message: 'Create a free account: free plan, no time limit, no credit card required',
    free_plan_includes: PLAN_CONFIG.FREE.features,
  },
}

export async function GET() {
  return Response.json(mcpManifest, {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req: Request) {
  // ── Rate limiting ────────────────────────────────────────────────────────
  // Per instance on purpose: a public, cacheable description; a shared
  // counter would add a database write per call (lib/security/shared-rate-limit).
  const ip = clientIp(req)

  maybePurgeStale()

  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  // ── Body size guard: reject oversized payloads ──────────────────────────
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return Response.json({ error: 'Payload too large' }, { status: 413 })
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return Response.json({ error: 'Payload too large' }, { status: 413 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fn = body?.function as FunctionName | undefined

  if (!fn || !(fn in functionResponses)) {
    return Response.json(
      { error: 'Unknown function', available: Object.keys(functionResponses) },
      { status: 400 },
    )
  }

  return Response.json(functionResponses[fn])
}
