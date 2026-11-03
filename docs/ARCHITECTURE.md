# 🏗️ Phantera: System Architecture

> **Audience:** developers joining the team, technical due-diligence reviewers, future architecture decisions.
>
> **Last updated:** June 2, 2026 · Phantera v0.1

---

## 📋 Table of Contents

1. [High-Level Architecture](#-high-level-architecture)
2. [The 5 AI Agents Pipeline](#-the-5-ai-agents-pipeline)
3. [Data Model](#-data-model)
4. [Request Lifecycles](#-request-lifecycles)
5. [Third-Party Services](#-third-party-services)
6. [Security Layers](#-security-layers)
7. [Observability](#-observability)
8. [Scalability Roadmap](#-scalability-roadmap)
9. [Design Principles](#-design-principles)

---

## 🎯 High-Level Architecture

Phantera is a **modular monolith** running on Vercel's edge platform. No microservices yet: keep one mental model until 50K MRR. Async work is scheduled via Vercel Cron.

```
                        ┌──────────────────────────┐
                        │       Browser            │
                        │  (Phantera Web App)      │
                        └────────────┬─────────────┘
                                     │ HTTPS
                                     ▼
            ┌─────────────────────────────────────────────────┐
            │           Vercel Edge (cdg1)                    │
            │  ┌────────────────────────────────────────┐    │
            │  │   Next.js 16 (App Router · Turbopack)  │    │
            │  │   ┌─────────────┐  ┌────────────────┐  │    │
            │  │   │  Server     │  │  Client        │  │    │
            │  │   │  Components │  │  Components    │  │    │
            │  │   └─────┬───────┘  └────────┬───────┘  │    │
            │  │         │                   │          │    │
            │  │   ┌─────▼───────────────────▼───────┐  │    │
            │  │   │   33 API Routes + Webhooks      │  │    │
            │  │   └────────┬────────────────────────┘  │    │
            │  └────────────┼─────────────────────────────┘    │
            │               │                                 │
            │  ┌────────────▼─────────────────────────────┐  │
            │  │   Middleware (Clerk auth + rate-limit)   │  │
            │  └────────────────────────────────────────┴───┘
            └─────────────────────────────────────────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
                ▼                    ▼                    ▼
        ┌──────────────┐    ┌──────────────┐    ┌────────────────┐
        │   Railway    │    │   3rd party  │    │   Cloudflare   │
        │  PostgreSQL  │    │    APIs      │    │ Email Worker   │
        │   + Prisma   │    │              │    │  (inbound)     │
        └──────────────┘    └──────┬───────┘    └────────┬───────┘
                                   │                     │
                  ┌────────┬───────┼───────┬─────────────┼────────┐
                  ▼        ▼       ▼       ▼             ▼        │
              Apollo   Hunter  Anthropic Stripe       Resend      │
              (leads)  (verify)(Claude) (billing)  (outbound)     │
                                                                  │
                                                       Webhook on │
                                                       reply ─────┘
```

---

## 🤖 The 5 AI Agents Pipeline

The product's heart. Each agent has **one responsibility**, decoupled from the others.

### Pipeline overview

```
USER intent (campaign launch)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/leads/search/stream  (SSE — Server-Sent Events)  │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────┐
│  AGENT 1 — SOURCE                                                  │
│  lib/services/apollo.ts → searchApolloLeads(ICP params)            │
│  ────────────────────────────────────────────────────────────────  │
│  • POST https://api.apollo.io/api/v1/mixed_people/api_search       │
│  • Returns leads with obfuscated last names (privacy-by-default)   │
│  • Filter: !!l.company  (no enrichment without org)                │
│  • SSE event: { type: 'search_done', leads: [...] }                │
└────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────┐
│  AGENT 2 — ENRICH                                                  │
│  Two-tier strategy:                                                │
│  ────────────────────────────────────────────────────────────────  │
│  TIER 1 — Apollo bulk_match (paid, real emails)                    │
│    • POST /api/v1/people/bulk_match                                │
│    • ~95% success rate                                             │
│    • 1 export credit per match (Basic plan = 250/mo)               │
│                                                                    │
│  TIER 2 — Hunter Email Finder (free fallback)                      │
│    • GET https://api.hunter.io/v2/email-finder                     │
│    • Used only for leads Apollo didn't enrich                      │
│    • Sanitises obfuscated last names before request                │
│                                                                    │
│  THEN — Hunter Verify (deliverability check)                       │
│    • GET https://api.hunter.io/v2/email-verifier                   │
│    • Sets emailSend.enrichment.emailVerified                       │
└────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────┐
│  AGENT 3 — SCORE                                                   │
│  lib/agents/lead-scorer.ts → scoreLeads(leads, icp, targeting)     │
│  ────────────────────────────────────────────────────────────────  │
│  • Anthropic Claude Sonnet 4.5                                     │
│  • Input: lead profile + ICP + targeting criteria                  │
│  • Output: score 0–100 + reasoning text + badge                    │
│  • Badges: FAST_TRACK (≥80) · NORMAL (50-79) · NURTURE (25-49)     │
│             · SKIP (<25)                                           │
│  • Persisted to Lead.aiScore + scoreBadge + scoreReason            │
└────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────┐
│  AGENT 4 — WRITE  (deferred to campaign creation)                  │
│  lib/agents/copywriter.ts → generateEmailWithCritique()            │
│  ────────────────────────────────────────────────────────────────  │
│  Self-critique loop:                                               │
│    1. Claude generates draft                                       │
│    2. Claude self-critiques on 5 axes (tone, fact, pain, etc.)     │
│    3. If score < 75 → regenerate with feedback                     │
│    4. Max 3 attempts                                               │
│  • Streaming via SSE: subject, body, score, critiqueNotes          │
│  • Persisted to CampaignEmailStep                                  │
└────────────────────────────────────────────────────────────────────┘
        │
        ▼ (Sequence launched · cron scheduler picks up)
┌────────────────────────────────────────────────────────────────────┐
│  Vercel Cron — /api/cron/process-sequences (hourly)                │
│  ────────────────────────────────────────────────────────────────  │
│  For each ACTIVE campaign:                                         │
│    • Find leads due for next step (lib/sequences/find-due.ts)      │
│    • Send via Resend (lib/sequences/send-step.ts)                  │
│    • Tag emails with sendId for tracking                           │
│    • Inject tracking pixel: /api/track/open?sid=...                │
│    • Set replyTo: reply+{sendId}@phantera-tn.com                   │
└────────────────────────────────────────────────────────────────────┘
        │
        ▼ (Lead replies to email)
┌────────────────────────────────────────────────────────────────────┐
│  Cloudflare Email Worker → POST /api/webhooks/inbound-email        │
│                                                                    │
│  AGENT 5 — REPLY CLASSIFICATION                                    │
│  lib/agents/reply-classifier.ts → classifyReply(body, subject)     │
│  ────────────────────────────────────────────────────────────────  │
│  • Anthropic Claude Haiku (fast, low cost)                         │
│  • Email parser: mailparser → 3-strategy fallback                  │
│  • Strip quoted reply (Gmail/Outlook/FR patterns)                  │
│  • Classification: POSITIVE / MEETING_REQUEST / NEGATIVE           │
│                    / NOT_INTERESTED / NEUTRAL                      │
│  • Updates Lead.status, qualifiedAt, lastReplyClassification       │
│  • Stops further outreach (doNotContact = true)                    │
│  • Fires push notification + analytics event                       │
└────────────────────────────────────────────────────────────────────┘
```

### Why this architecture?

- **Decoupled**: each agent has its own service module under `lib/`, testable in isolation
- **Resilient**: Tier 2 fallback in Agent 2 means Apollo outage doesn't kill enrichment
- **Cost-aware**: Sonnet for high-stakes scoring/writing, Haiku for cheap classification
- **Observable**: every agent emits PostHog events (`first_lead_saved`, `first_email_sent`, `first_reply_received`)
- **Cancellable**: SSE pipeline supports AbortController on the client

---

## 🗄️ Data Model

The schema lives in `apps/api/prisma/schema.prisma` (11 models, 30+ indexes). Core relationships:

```
                    ┌─────────┐
                    │  User   │       Clerk-managed identity
                    └────┬────┘
                         │ 1:N
                         ▼
                    ┌────────────┐
        ┌───────────│ Workspace  │←──── Plan enum (FREE/PRO/BUSINESS/ENTERPRISE)
        │           └─────┬──────┘
        │                 │ 1:N
        │ 1:N             ▼
        │           ┌──────────────┐
        │           │   Campaign   │
        │           └────┬─────────┘
        │                │ 1:N
        ▼                ▼
   ┌────────┐    ┌──────────────────┐
   │  Lead  │    │ CampaignEmailStep│
   └───┬────┘    └────────┬─────────┘
       │                  │
       │ 1:1              │ 1:N
       ▼                  ▼
   ┌──────────────┐  ┌────────────┐
   │LeadEnrichment│  │ EmailSend  │←─── status enum, tracking
   └──────────────┘  └────┬───────┘
                          │ 1:N
                          ▼
                     ┌─────────────┐
                     │ EmailReply  │←─── Agent 5 classification
                     └─────────────┘
```

### Key tables and their roles

| Table | Role |
|-------|------|
| `User` | Clerk identity bridge (clerkId -> DB user) |
| `Workspace` | Multi-tenant boundary. Owns plan, billing, ICP defaults |
| `WorkspaceMember` | Multi-user RBAC (OWNER / ADMIN / MEMBER): UI not yet implemented |
| `Campaign` | Top-level outreach unit; status DRAFT/ACTIVE/PAUSED/COMPLETED |
| `CampaignEmailStep` | Individual emails in a sequence (position, dayOffset, AI-generated) |
| `Lead` | Person being prospected; aiScore + scoreBadge + status |
| `LeadEnrichment` | Hunter verification data: 1:1 with Lead |
| `EmailSend` | Tracking unit per (lead × step); status, openedAt, clickedAt |
| `EmailReply` | Inbound reply with classification + confidence |
| `Notification` | Real-time alerts to the dashboard (lead replied, etc.) |

### Tenant isolation

Every query MUST filter by `workspaceId` derived from the authenticated `userId`. The repository layer (`lib/repositories/`) enforces this. Routes use `verifyWorkspaceOwnership()` or `resolveWorkspace()` helpers.

---

## 🔄 Request Lifecycles

### Lifecycle 1: User runs the AI prospecting pipeline

```
User clicks "Prospect with AI" in /dashboard/leads
         │
         ▼
[Client] LeadsPageClient calls fetch('/api/leads/search/stream')
         │
         ▼
[Middleware] Clerk authenticates · rate-limit checks (10 req/5min/user)
         │
         ▼
[Route] auth() → workspace lookup → checkLeadQuota() → SSE start
         │
         ├──► Agent 1: Apollo search (no credits used)
         ├──► Agent 2: Apollo bulk_match (1 credit/lead) + Hunter fallback
         ├──► DB: upsert leads by (workspaceId, email) OR apolloId
         ├──► Agent 3: Claude scores leads → updates DB
         ├──► PostHog: first_search_launched, first_lead_saved
         │
         ▼
[Client] SSE events stream into LeadsTable in real-time
```

### Lifecycle 2: Sequence sends an email

```
[Cron] /api/cron/process-sequences runs hourly
         │
         ▼
[Route] auth bearer = CRON_SECRET → query ACTIVE campaigns
         │
         ▼ for each campaign
[lib/sequences/process-campaign.ts]
   1. Atomic claim via updateMany(lastProcessedAt < now-50min)
   2. findLeadsDueForNextStep() → batch in chunks of 10
   3. For each lead: sendStepToLead() → Resend API
   4. Inject tracking pixel + replyTo address
   5. Track first_email_sent if campaign.sentCount was 0
         │
         ▼
[Resend] Delivers email · Resend webhook fires email.sent/delivered
         │
         ▼
[Route] /api/webhooks/resend → updates EmailSend.status
```

### Lifecycle 3: Lead replies (Agent 5)

```
[Gmail/Outlook] Lead clicks Reply · sends to reply+xxx@phantera-tn.com
         │
         ▼
[Cloudflare] Email Worker receives MIME message
         │
         ▼ POST with secret header
[Route] /api/webhooks/inbound-email
   1. Verify INBOUND_WEBHOOK_SECRET
   2. Parse sendId from To address (reply+xxx@…)
   3. Load EmailSend + lead + campaign + workspace.owner.clerkId
   4. extractEmailBody(raw, text) → mailparser → stripQuotedReply
   5. classifyReply() → Claude Haiku
   6. DB transaction:
      • Create EmailReply
      • Increment campaign.replyCount
      • Update lead.status (qualified/lost) + doNotContact = true
   7. Create dashboard notification
   8. Track first_reply_received event
```

### Lifecycle 4: User upgrades to BUSINESS plan

```
User clicks "Upgrade to Business" (annual)
         │
         ▼
[Client] POST /api/stripe/checkout { plan: 'BUSINESS', billing: 'annual' }
         │
         ▼
[Route] resolvePriceId('BUSINESS', 'annual') → STRIPE_BUSINESS_ANNUAL_PRICE_ID
   • Rate-limit (5 req/min/user)
   • getOrCreateStripeCustomer()
   • Stripe Checkout session created with metadata.workspaceId
   • Return { url } → window.location redirect
         │
         ▼
[Stripe] Hosted checkout · user pays
         │
         ▼ webhook fires
[Route] /api/webhooks/stripe → checkout.session.completed
   1. Verify Stripe signature
   2. syncSubscriptionToWorkspace(subscriptionId, workspaceId)
      • Update workspace.plan = BUSINESS
      • Set stripeCurrentPeriodEnd
      • Set stripeSubscriptionId
   3. Track checkout_completed event
         │
         ▼
User redirected to /dashboard?success=true
   • workspace.plan reads BUSINESS
   • New quotas active immediately
```

---

## 🌐 Third-Party Services

| Provider | Purpose | Failure mode |
|----------|---------|--------------|
| **Vercel** | Hosting + Edge functions + Cron | Critical: no fallback |
| **Railway PostgreSQL** | Primary database | Critical: Prisma errors degrade gracefully |
| **Clerk** | Auth (JWT + sessions + webhooks) | Critical: 401 if down |
| **Stripe** | Payments + customer portal + webhooks | High: checkout fails, signups continue |
| **Anthropic Claude** | Agents 3, 4, 5 | Medium: scoring/writing/classification degraded |
| **Apollo.io** | Lead sourcing + enrichment (paid plan) | Medium: Hunter fallback for emails |
| **Hunter.io** | Email finder fallback + verification | Low: accept-all email mode if down |
| **Resend** | Transactional email sending | High: campaigns can't send |
| **Cloudflare Email Worker** | Inbound email -> webhook | Medium: replies lost but campaign continues |
| **Sentry** | Error tracking (EU region) | None: fire-and-forget |
| **PostHog** | Product analytics | None: fire-and-forget |

### Why Apollo + Hunter (and not just one)?

Apollo gives us **structured search** + **real emails via bulk_match** (uses paid credits). Hunter is our **free fallback** for leads Apollo couldn't enrich. This 2-tier strategy moved our success rate from **10% -> 70%** of leads having a verified email.

---

## 🛡️ Security Layers

Full details in [docs/SECURITY.md](SECURITY.md). Summary:

```
Layer 1 — Network    │ Cloudflare DDoS protection · Vercel edge
Layer 2 — TLS        │ HTTPS only · HSTS preload · strict-origin
Layer 3 — Headers    │ Strict CSP · X-Frame-Options DENY · Referrer-Policy
Layer 4 — Auth       │ Clerk JWT + sessions · SameSite cookies
Layer 5 — Authz      │ Workspace-scoped queries · IDOR audit clean (6/6)
Layer 6 — Rate limit │ In-memory LRU on sensitive endpoints
Layer 7 — Validation │ Zod schemas at every API boundary
Layer 8 — DB         │ Prisma parameterised queries (no raw SQL injection)
Layer 9 — Secrets    │ Env vars only · 6 webhook signature checks
Layer 10 — GDPR      │ Cookie consent · Privacy + Terms · audit log
```

---

## 📊 Observability

```
Errors          → Sentry (EU region, replays on error, 0.1× sample in prod)
Logs            → structured logger.ts → Vercel logs + Sentry breadcrumbs
Analytics       → PostHog (12 typed events, AARRR funnel)
Uptime          → not implemented yet (Sprint 3 ticket)
Cron monitoring → Vercel automatic cron logs + Sentry integration
```

### Critical events tracked (PostHog)

```
Acquisition  →  signup_completed
                onboarding_completed

Activation   →  first_search_launched
                first_lead_saved
                first_campaign_created
                first_email_sent
                first_reply_received

Revenue      →  checkout_started
                checkout_completed
                subscription_cancelled

Retention    →  csv_exported
                campaign_launched
```

---

## 📈 Scalability Roadmap

### Current state (0-1k users)

- ✅ Monolith on Vercel: sufficient
- ✅ Sync cron processor: works at < 100 active campaigns
- ⚠️  In-memory rate-limit (per-instance): fine for low traffic

### Phase 2 (1k-10k users)

- 🔮 Migrate cron -> **Inngest** (async queue, retries, replay)
- 🔮 Replace in-memory rate-limit -> **Upstash Redis**
- 🔮 Add **Redis cache** layer for dashboard queries
- 🔮 PgBouncer in front of Railway PostgreSQL

### Phase 3 (10k-100k users)

- 🔮 Extract heavy async work (Agent 4 generation, sequence processing) to separate **edge functions**
- 🔮 Move CRM integrations to **webhook-driven async** model
- 🔮 Multi-region read replicas
- 🔮 Dedicated analytics ETL -> ClickHouse or BigQuery

### Phase 4 (> 100k users)

- 🔮 Consider extracting **AI agents** to separate service (cost / latency control)
- 🔮 Multi-tenant **Kafka** for event streaming
- 🔮 Hybrid SOC2 + ISO 27001 certifications

---

## 🎓 Design Principles

When in doubt, default to these:

### 1. **Single Source of Truth (SSOT)**
- Design tokens -> `lib/design/tokens.ts`
- Plan config -> `lib/stripe/plans.ts`
- Event taxonomy -> `lib/analytics/events.ts` + `server-events.ts`
- Database schema -> `prisma/schema.prisma`

### 2. **Fire-and-forget for analytics**
- Never block a request for tracking
- Helpers wrap in try/catch and swallow errors
- No-op gracefully when API keys are missing

### 3. **Tenant isolation enforced at every query**
- `workspaceId` filter on every DB call
- Repository layer + helpers prevent leaks
- IDOR audit clean (6/6 dynamic routes)

### 4. **Validation at boundaries**
- Zod schemas at every API route entry
- Webhook signature verification before parsing
- Rate-limit before logic

### 5. **Type-safe everything**
- TypeScript `strict` mode
- Zero `any` (warning enforced via ESLint)
- Prisma generates types from schema

### 6. **Cost-conscious AI**
- Claude **Sonnet** only for high-stakes (scoring, writing)
- Claude **Haiku** for cheap repetitive (reply classification)
- Apollo paid credits used sparingly (Hunter fallback)

### 7. **Resilience by design**
- Circuit-break by graceful degradation (no fallback for Clerk, fallbacks for Apollo/Hunter)
- Idempotent webhook handlers (deduplication on identifiers)
- Atomic claims for concurrent cron runs

### 8. **No premature abstraction**
- Monolith until 50K MRR
- Extract services when pain is real, not anticipated

---

## 🧭 Where to look first when investigating

| Concern | Start here |
|---------|------------|
| Why did this user get charged? | `lib/stripe/sync.ts` + Stripe Dashboard |
| Why is open tracking at 0%? | `app/api/track/open/route.ts` + middleware public routes |
| Why no email arrived? | `lib/sequences/process-campaign.ts` + cron logs |
| Why reply not classified? | `app/api/webhooks/inbound-email/route.ts` + Cloudflare Worker logs |
| Why so many DB queries? | `lib/repositories/` + N+1 patterns |
| Why a 500 in production? | Sentry -> grouped by route + breadcrumbs |
| Why is analytics empty? | PostHog dashboard -> Activity tab + env vars |

---

**Owner:** Engineering team
**Next review:** Quarterly OR after any major architectural change
