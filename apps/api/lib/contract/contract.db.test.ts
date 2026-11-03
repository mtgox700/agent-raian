/**
 * Runtime proof that the contract and the back agree: every GET endpoint of
 * the contract is called through its real route handler, against a real
 * Postgres seeded with a small workspace, as a signed-in member. Every 2xx
 * JSON answer must parse with the endpoint's `response` schema.
 *
 * Needs a dedicated, bootstrapped database (it is wiped at start):
 *   psql -h /tmp -p 55432 -U postgres -c "create database contract_it"
 *   DATABASE_URL=postgresql://postgres@localhost:55432/contract_it DIRECT_URL=… node scripts/db-bootstrap.mjs
 *   CONTRACT_DB_URL=postgresql://postgres@localhost:55432/contract_it npx vitest run lib/contract/contract.db.test.ts
 * Skipped when CONTRACT_DB_URL is not set (CI has no database).
 * CONTRACT_DB_DUMP=<file> appends one line per answer (status, size, start of body) to that file.
 */

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi } from 'vitest'
import { NextRequest } from 'next/server'
import { endpoints, type EndpointDef } from '@phantera/contract'
import type { PrismaClient } from '@prisma/client'

const DB_URL = vi.hoisted(() => {
  const url = process.env.CONTRACT_DB_URL
  if (url) {
    process.env.DATABASE_URL = url
    process.env.DIRECT_URL = url
    // Signs export download links; any 32-byte key will do for a test database.
    process.env.ENCRYPTION_KEY ??= '0'.repeat(64)
  }
  return url
})

const CLERK_ID = 'user_contract_it'
const EMAIL = 'owner@contract-it.example'

vi.mock('@clerk/nextjs/server', () => {
  const user = {
    id: 'user_contract_it',
    firstName: 'Camille',
    lastName: 'Rousset',
    imageUrl: '',
    twoFactorEnabled: false,
    primaryEmailAddress: { emailAddress: 'owner@contract-it.example' },
    emailAddresses: [{ emailAddress: 'owner@contract-it.example' }],
  }
  return {
    auth: vi.fn(async () => ({ userId: user.id, sessionId: 'sess_contract_it', sessionClaims: {} })),
    currentUser: vi.fn(async () => user),
    clerkClient: vi.fn(async () => ({ users: { getUser: async () => user } })),
  }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
  headers: async () => new Headers(),
}))

/** Not called here: they need a file/stream/redirect reader, an external provider, or no session. */
const SKIPPED: Record<string, string> = {}

const ALL = endpoints as readonly EndpointDef[]
const GETS = ALL.filter((e) => e.method === 'GET')

describe.skipIf(!DB_URL)('API contract against a real database', () => {
  let db: PrismaClient
  const seed = {} as { workspaceId: string; campaignId: string; leadId: string; conversationId: string }

  beforeAll(async () => {
    const name = new URL(DB_URL!).pathname.slice(1)
    if (!/contract|test/i.test(name)) throw new Error(`Refusing to wipe database "${name}": use a dedicated one (name containing "contract" or "test").`)
    db = (await import('@/lib/db')).db as PrismaClient
    const tables = await db.$queryRaw<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`
    await db.$executeRawUnsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} cascade`)
    Object.assign(seed, await seedWorkspace(db))
  }, 60_000)

  afterAll(async () => { await db?.$disconnect() })

  const params = (): Record<string, string> => ({ campaignId: seed.campaignId, leadId: seed.leadId, id: seed.conversationId })
  /** Required query values: the workspace for the endpoints that name it. */
  const queries = (e: EndpointDef): Record<string, string> => {
    const shape = (e.query as { shape?: Record<string, unknown> } | undefined)?.shape ?? {}
    return 'workspaceId' in shape ? { workspaceId: seed.workspaceId } : {}
  }

  for (const e of GETS) {
    const kind = e.responseKind ?? 'json'
    const reason = e.auth === 'public' ? 'public endpoint (no member session)'
      : kind !== 'json' ? `responseKind ${kind}`
      : SKIPPED[e.id]
    if (reason) {
      it.skip(`${e.id} (skipped: ${reason})`, () => {})
      continue
    }

    it(`${e.id}: GET ${e.path} matches its response schema`, async () => {
      const p = params()
      const names = [...e.path.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])
      const missing = names.filter((n) => !p[n])
      expect(missing, `no seed value for path params of ${e.path}`).toEqual([])
      const routeParams = Object.fromEntries(names.map((n) => [n, p[n]]))
      const path = e.path.replace(/\[([^\]]+)\]/g, (_, n: string) => encodeURIComponent(p[n]))
      const url = new URL(`http://localhost:3000${path}`)
      for (const [k, v] of Object.entries(queries(e))) url.searchParams.set(k, v)

      const mod = await import(/* @vite-ignore */ join(__dirname, '..', '..', 'app', e.path, 'route.ts')) as { GET: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> }
      const res = await mod.GET(new NextRequest(url), { params: Promise.resolve(routeParams) })
      const text = await res.text()
      expect(res.status, `${e.id} answered ${res.status}: ${text.slice(0, 500)}`).toBeGreaterThanOrEqual(200)
      expect(res.status, `${e.id} answered ${res.status}: ${text.slice(0, 500)}`).toBeLessThan(300)

      const body: unknown = JSON.parse(text)
      if (process.env.CONTRACT_DB_DUMP) appendFileSync(process.env.CONTRACT_DB_DUMP, `${e.id} ${res.status} ${text.length}B ${text.slice(0, 160)}\n`)
      const parsed = e.response.safeParse(body)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
        throw new Error(`${e.id}: response does not match the contract\n${issues}\nbody: ${text.slice(0, 1500)}`)
      }
      expect(isEmpty(body), `${e.id} returned an empty body`).toBe(false)
      // `{ redirect }` is the no-workspace branch: a member must get the real view.
      expect(body, `${e.id} answered the no-access redirect`).not.toMatchObject({ redirect: expect.any(String) })
    }, 30_000)
  }

  afterAll(() => {
    const skipped = GETS.filter((e) => e.auth === 'public' || (e.responseKind ?? 'json') !== 'json' || SKIPPED[e.id])
    console.info(`[contract.db] ${GETS.length - skipped.length} GET endpoints covered, ${skipped.length} skipped:\n${skipped.map((e) => `  - ${e.id} (${e.auth === 'public' ? 'public' : SKIPPED[e.id] ?? `responseKind ${e.responseKind}`})`).join('\n')}`)
  })
})

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (Array.isArray(v)) return false // an empty list is a valid answer; content is checked by the schema
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

const DAY = 86_400_000

/** A small but complete workspace: owner on Business (the inbox is gated on it), a campaign with two steps, three leads, replies, touches, alerts. */
async function seedWorkspace(db: PrismaClient) {
  const now = Date.now()
  const ago = (days: number) => new Date(now - days * DAY)

  const user = await db.user.create({ data: { clerkId: CLERK_ID, email: EMAIL, name: 'Camille Rousset' } })
  const ws = await db.workspace.create({
    data: {
      name: 'Horalys (contract test)', ownerId: user.id, plan: 'BUSINESS', targetIndustry: 'SaaS', targetCompanySize: 'S',
      onboardingCompleted: true, sendingDomain: 'horalys.example',
      emailSignature: { fullName: 'Camille Rousset', title: 'Fondatrice', company: 'Horalys' },
    },
  })
  await db.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' } })

  const mailbox = await db.connectedMailbox.create({
    data: {
      workspaceId: ws.id, ownerUserId: user.id, provider: 'GMAIL', email: 'camille@horalys.example', displayName: 'Camille Rousset',
      accessTokenEnc: 'not-a-real-token', status: 'CONNECTED', isDefault: true, dailyCap: 40, lastSyncAt: ago(0.1), sharedWithTeam: true,
    },
  })
  await db.connectedChannel.create({
    data: { workspaceId: ws.id, ownerUserId: user.id, provider: 'LINKEDIN', status: 'CONNECTED', label: 'Camille Rousset', unipileAccountId: 'acc_contract_it' },
  })

  const campaign = await db.campaign.create({
    data: {
      workspaceId: ws.id, ownerUserId: user.id, name: 'DSI SaaS Île-de-France', status: 'ACTIVE', goal: 'DEMOS',
      targetIndustry: 'SaaS', targetTitles: ['DSI', 'CTO'], targetCompanySizes: ['S', 'M'], targetGeos: ['France'],
      valueProposition: 'Planifier les astreintes sans tableur.', leadSource: 'CSV_IMPORT', estimatedLeads: 3,
      sentCount: 3, openCount: 2, replyCount: 1, connectedMailboxId: mailbox.id, lastProcessedAt: ago(0.05), createdAt: ago(10),
    },
  })
  await db.campaignStatusEvent.create({ data: { campaignId: campaign.id, workspaceId: ws.id, fromStatus: 'DRAFT', toStatus: 'ACTIVE', at: ago(9) } })
  const step1 = await db.campaignEmailStep.create({
    data: { campaignId: campaign.id, position: 1, dayOffset: 0, channel: 'EMAIL', subject: 'Vos astreintes, {{company}}', body: 'Bonjour {{firstName}},\n\nUne question rapide sur vos astreintes.', aiScore: 82 },
  })
  const step2 = await db.campaignEmailStep.create({
    data: { campaignId: campaign.id, position: 2, dayOffset: 3, channel: 'WHATSAPP', subject: '', body: 'Bonjour {{firstName}}, je vous ai écrit par email.', isAiGenerated: false },
  })

  const people = [
    { firstName: 'Léa', lastName: 'Martin', company: 'Nuvio', title: 'DSI', aiScore: 88, scoreBadge: 'FAST_TRACK' as const, phone: '+33612345678', status: 'replied' },
    { firstName: 'Hugo', lastName: 'Bernard', company: 'Kalio', title: 'CTO', aiScore: 64, scoreBadge: 'NORMAL' as const, phone: '+33698765432', status: 'contacted' },
    { firstName: 'Inès', lastName: 'Petit', company: 'Orbe', title: 'Head of IT', aiScore: 41, scoreBadge: 'NURTURE' as const, phone: null, status: 'new' },
  ]
  const leads = []
  for (const [i, p] of people.entries()) {
    const domain = `${p.company.toLowerCase()}.example`
    const lead = await db.lead.create({
      data: {
        workspaceId: ws.id, campaignId: campaign.id, ...p, email: `${p.firstName.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()}@${domain}`,
        industry: 'SaaS', website: `https://${domain}`, country: 'France', companySize: 'S', phoneSource: p.phone ? 'MANUAL' : null,
        source: 'CSV_IMPORT', scoreReason: 'Décideur IT dans la cible.', createdAt: ago(9 - i),
        ...(i === 0 ? { lastReplyAt: ago(1), lastReplyClassification: 'POSITIVE', lastReplySnippet: 'Oui, parlons-en jeudi.', qualifiedAt: ago(1) } : {}),
        enrichment: { create: { emailVerified: true, emailConfidence: 92 - i * 10, emailStatus: 'valid' } },
      },
    })
    leads.push(lead)
  }

  // A scored lead not yet in a campaign: what « add leads » offers.
  await db.lead.create({
    data: {
      workspaceId: ws.id, firstName: 'Nora', lastName: 'Lefèvre', email: 'nora@vela.example', company: 'Vela', title: 'DSI',
      industry: 'SaaS', country: 'France', companySize: 'M', source: 'CSV_IMPORT', aiScore: 81, scoreBadge: 'FAST_TRACK', createdAt: ago(2),
      enrichment: { create: { emailVerified: true, emailConfidence: 88, emailStatus: 'valid' } },
    },
  })

  const sends = []
  for (const [i, lead] of leads.entries()) {
    sends.push(await db.emailSend.create({
      data: {
        leadId: lead.id, campaignId: campaign.id, emailStepId: step1.id, mailboxId: mailbox.id,
        status: i === 0 ? 'OPENED' : i === 1 ? 'OPENED' : 'SENT', sentAt: ago(8 - i), openedAt: i < 2 ? ago(7 - i) : null,
        providerMessageId: `msg-${i}`, providerThreadId: `thr-${i}`, attempts: 1, createdAt: ago(8 - i),
      },
    }))
  }
  // Step 2 (WhatsApp) drafted for Hugo, waiting in the touch queue.
  const awaiting = await db.emailSend.create({ data: { leadId: leads[1].id, campaignId: campaign.id, emailStepId: step2.id, status: 'AWAITING_USER', createdAt: ago(0.5) } })
  await db.leadTouch.create({ data: { workspaceId: ws.id, leadId: leads[1].id, campaignId: campaign.id, channel: 'WHATSAPP', body: 'Bonjour Hugo, je vous ai écrit par email.', status: 'TODO', emailSendId: awaiting.id, createdAt: ago(0.5) } })
  await db.leadTouch.create({ data: { workspaceId: ws.id, leadId: leads[0].id, campaignId: campaign.id, channel: 'SMS', body: 'Merci Léa, à jeudi.', status: 'SENT', sentAt: ago(0.8), createdAt: ago(0.8) } })

  await db.emailReply.create({
    data: { emailSendId: sends[0].id, campaignId: campaign.id, leadId: leads[0].id, receivedAt: ago(1), fromEmail: leads[0].email, bodyText: 'Oui, parlons-en jeudi.', classification: 'POSITIVE', confidence: 91, isProcessed: false },
  })
  await db.notification.create({
    data: { workspaceId: ws.id, type: 'LEAD_REPLIED_POSITIVE', title: 'Léa Martin a répondu', body: 'Oui, parlons-en jeudi.', data: { classification: 'POSITIVE' }, leadId: leads[0].id, campaignId: campaign.id, createdAt: ago(1) },
  })
  await db.auditEvent.create({ data: { workspaceId: ws.id, actorUserId: user.id, actorLabel: EMAIL, action: 'mailbox.connect', targetType: 'mailbox', targetId: mailbox.id, details: { provider: 'GMAIL' }, createdAt: ago(10) } })
  await db.workspaceExport.create({ data: { workspaceId: ws.id, requestedById: user.id, status: 'READY', sizeBytes: 2048, expiresAt: new Date(now + 6 * DAY), completedAt: ago(0.2), createdAt: ago(0.2) } })
  await db.insight.create({
    data: {
      workspaceId: ws.id, campaignId: campaign.id, key: `low-reply:${campaign.id}`, kind: 'low_reply', severity: 'alerte',
      title: 'Peu de réponses sur DSI SaaS Île-de-France', evidence: { sent: 3, replies: 1 }, next: 'Relire l’objet du premier email.', actions: ['pause'],
    },
  })
  const conversation = await db.analystConversation.create({
    data: {
      workspaceId: ws.id, userId: user.id, title: 'Quelles campagnes sont bloquées ?',
      messages: {
        create: [
          { role: 'user', content: 'Quelles campagnes sont bloquées ?' },
          { role: 'assistant', content: 'Aucune campagne bloquée [1].', status: 'answered', evidence: [{ ref: 1, tool: 'campaign_facts', data: { campaigns: 1 } }], latencyMs: 1200 },
        ],
      },
    },
  })

  return { workspaceId: ws.id, campaignId: campaign.id, leadId: leads[0].id, conversationId: conversation.id }
}
