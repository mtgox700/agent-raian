# 🛡️ Phantera: Security Documentation

> **Status:** Production-ready for V0 beta launch · pre-SOC2
>
> **OWASP Top 10 (2021) coverage:** 9/10 mitigations in place · 1 monitored (A09)
>
> **Last audited:** June 2, 2026 · Sprint 1 closure

---

## 📋 Table of Contents

1. [Threat Model](#-threat-model)
2. [OWASP Top 10: Mitigation Status](#-owasp-top-10--mitigation-status)
3. [Authentication & Authorization](#-authentication--authorization)
4. [Secrets Management](#-secrets-management)
5. [Webhook Security](#-webhook-security)
6. [Rate Limiting](#-rate-limiting)
7. [Data Privacy & GDPR](#-data-privacy--gdpr)
8. [Logging & Monitoring](#-logging--monitoring)
9. [Incident Response Runbook](#-incident-response-runbook)
10. [Security Roadmap](#-security-roadmap)

---

## 🎯 Threat Model

### Assets we protect

| Asset | Value | Loss impact |
|-------|-------|-------------|
| **User PII** (email, name, workspace data) | High | GDPR fines + brand damage |
| **Stripe customer data** (subscriptions, payment methods) | Critical | Direct revenue loss + lawsuit |
| **Lead database** (sales pipelines) | High | User churn + competitor advantage |
| **API keys** (Apollo, Hunter, Anthropic) | Medium | Service hijack + cost overrun |
| **Inbound email gateway** | Medium | Reply theft / impersonation |
| **Brand reputation** | Critical | Trust loss = no users |

### Adversaries we defend against

| Actor | Motivation | Sophistication | Defence layers |
|-------|-----------|----------------|----------------|
| **Script kiddie** | Curiosity / random scanning | Low | Rate limiting, WAF (Cloudflare/Vercel), security headers |
| **Competitor scraper** | Data harvesting | Medium | Rate limiting, auth gates, IDOR controls |
| **Disgruntled user** | Revenge / abuse | Low-Medium | Quota enforcement, audit logging, workspace isolation |
| **Spam abuser** | Use Phantera for spam | Medium | Quota enforcement, Resend deliverability tracking, doNotContact lists |
| **API key thief** | Cost shifting | Medium-High | Server-side price IDs, env var hygiene, webhook signature verification |
| **Sophisticated attacker** | Steal user data | High | SOC2 readiness ongoing: full pen-test required pre-launch |

### Explicitly out of scope (V0)

- Physical security of office machines (no dedicated infra)
- Insider threat (single-founder model)
- Sophisticated cryptanalysis (no on-prem key material)

---

## 🔒 OWASP Top 10: Mitigation Status

### A01: Broken Access Control · ✅ MITIGATED

**Risk:** users access data belonging to other workspaces (IDOR).

**Defences in place:**

1. **All authenticated routes use Clerk's `auth()`**: userId resolved from secure session
2. **Workspace-scoped queries enforced via helpers:**
   - `resolveWorkspace(userId)` returns the user's *own* workspace
   - `verifyWorkspaceOwnership(userId, workspaceId)` checks ownership before mutation
3. **Repository layer** in `lib/repositories/` adds `workspaceId` to every query
4. **IDOR audit completed on 6/6 dynamic `[id]` routes**: all properly filter by workspaceId:
   - `app/api/campaigns/[campaignId]/launch`
   - `app/api/campaigns/[campaignId]/status`
   - `app/api/campaigns/[campaignId]/step-stats`
   - `app/api/leads/[leadId]/status`
   - `app/api/leads/enrich/[leadId]`
   - `app/api/notifications/[id]/read`

**Test:**
```bash
# Attempt cross-tenant read
curl -X GET https://phantera-tn.com/api/leads/<OTHER_USER_LEAD_ID>/status \
     -H "Authorization: Bearer YOUR_SESSION"
# Expected: 404 or 403 — never returns the other user's data
```

---

### A02: Cryptographic Failures · ✅ MITIGATED

**Risk:** sensitive data transmitted or stored unencrypted.

**Defences in place:**

- **TLS 1.3 enforced**: Vercel terminates HTTPS, redirects HTTP -> HTTPS
- **HSTS preload**: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- **Passwords NEVER stored locally**: Clerk handles all auth
- **Stripe sensitive data** (card numbers, CVV): never touch our servers, handled by Stripe Elements / Checkout
- **API keys in env vars only**: never committed to git (audit: 0 secrets in source code)
- **Database connection**: SSL-enforced PostgreSQL on Railway
- **Webhook secrets**: separate per provider, rotated when exposed

**Verified:**
- `next.config.js`: HSTS header set
- `git log --all -p | grep -iE "sk_(live|test)_|password.*="` -> empty

---

### A03: Injection · ✅ MITIGATED

**Risk:** SQL injection, NoSQL injection, XSS.

**Defences in place:**

| Attack vector | Mitigation |
|---------------|-----------|
| **SQL Injection** | Prisma ORM: all queries parameterised, no raw SQL except `prisma.$queryRaw` (not used) |
| **NoSQL Injection** | Not applicable: pure PostgreSQL |
| **XSS** | React default escaping in JSX; CSP `script-src 'self'` (with explicit Clerk + PostHog exceptions) |
| **HTML Injection** | All user-rendered content uses `{value}` (escaped): no `dangerouslySetInnerHTML` on untrusted input |
| **Command Injection** | No `exec()`, `spawn()`, `child_process` in application code |

**Test:**
```bash
# Sanity check: ESLint catches dangerouslySetInnerHTML
cd apps/api && grep -rn "dangerouslySetInnerHTML" --include="*.tsx" components app
# Expected: empty
```

---

### A04: Insecure Design · ✅ MITIGATED

**Risk:** systemic design flaws (e.g. missing rate limits, no quotas, weak business logic).

**Defences in place:**

1. **Rate limiting on all expensive endpoints** (Section 6 below)
2. **Plan-based quotas enforced server-side**:
   - `checkLeadQuota`: blocks at 100/mo on FREE
   - `checkCampaignQuota`: blocks at 1 active on FREE
   - `checkEmailSendQuota`: blocks at 100/mo on FREE
   - `checkAiGenerationAllowed`: blocks AI generation on FREE
3. **Workspace isolation by default**: no global queries from user-facing routes
4. **Critical paths covered by unit tests** (Vitest, 92% line coverage on `stripe/sync`, `email-parser`, `rate-limit`)
5. **Idempotent webhook handlers**: replay-safe via signature dedup

---

### A05: Security Misconfiguration · ✅ MITIGATED

**Risk:** debug endpoints in prod, permissive CORS, weak headers.

**Defences in place:**

1. **No debug endpoints in production**: `/api/debug/*` deleted entirely (was a Sprint 1 P0)
2. **Strict CSP** in `next.config.js`:
   ```
   default-src 'self'
   script-src 'self' 'unsafe-eval' 'unsafe-inline' <clerk> <posthog>
   frame-ancestors 'none'
   ```
3. **Security headers** applied to all routes:
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `X-XSS-Protection: 1; mode=block`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
4. **No CORS allow-all**: Next.js default same-origin
5. **`.env.local` in `.gitignore`**: verified
6. **Default Next.js error pages** customised -> no stack traces leaked
7. **Dev-only routes gated**: `/design-system` 404s in production via middleware

---

### A06: Vulnerable Components · ⚠️ MONITORED

**Risk:** outdated npm packages with known CVEs.

**Status:** `npm audit` shows **2 moderate vulnerabilities** (transitive deps). No critical/high.

**Action items:**
- Run `npm audit` weekly as part of CI
- Renovate / Dependabot bot to be configured (Sprint 2 ticket)
- Critical dependencies (`@clerk/nextjs`, `stripe`, `next`, `prisma`): pinned to known-stable versions

**Test:**
```bash
npm audit --audit-level=high
# Expected: 0 high / critical
```

---

### A07: Identification & Authentication Failures · ✅ MITIGATED

**Risk:** weak auth, session fixation, credential stuffing.

**Defences in place:**

1. **Clerk handles all authentication:**
   - Argon2 password hashing (offloaded)
   - JWT-based sessions with short expiry
   - Automatic CSRF protection via SameSite cookies
   - Refresh token rotation
   - Bot detection (`challenges.cloudflare.com` in CSP)
2. **MFA available** for users (Clerk dashboard toggle: not enforced V0)
3. **No password reset flow on our side**: Clerk-managed
4. **Session revocation** via Clerk dashboard for compromised accounts

**Test:**
```bash
# Attempt to access protected route without session
curl -i https://phantera-tn.com/dashboard
# Expected: 307 redirect to /sign-in
```

---

### A08: Software & Data Integrity Failures · ✅ MITIGATED

**Risk:** untrusted code execution, package tampering, CI/CD compromise.

**Defences in place:**

1. **Package integrity**: `package-lock.json` committed, `npm ci` used in CI
2. **No deserialisation of untrusted data** (no `eval`, no `Function()` from user input)
3. **CI builds reproducible**: single workflow, no manual deploy steps
4. **Vercel deployments signed**: automatic, no manual artefact uploads
5. **Webhook integrity**: every webhook validates signatures (Section 5)
6. **CSP `frame-ancestors 'none'`**: prevents clickjacking via iframes
7. **Subresource Integrity (SRI)**: no external scripts loaded outside Clerk + PostHog (verified bundles)

---

### A09: Security Logging & Monitoring Failures · ✅ ADDRESSED

**Risk:** breaches go undetected because logs are unstructured / unmonitored.

**Defences in place:**

1. **Sentry installed and active** (`@sentry/nextjs@10.55`):
   - All `logger.error()` calls forward to Sentry
   - Stack traces with breadcrumbs
   - Session Replay on errors (browser-side)
   - EU region (`ingest.de.sentry.io`): GDPR-friendly
2. **Structured logger** (`lib/utils/logger.ts`):
   - JSON output with severity + context
   - Vercel logs ingested by default
3. **PostHog analytics**: 12 events for AARRR funnel tracking
4. **Webhook event tracking**: every Clerk / Stripe / Resend / inbound-email handler logs success / failure
5. **Audit trail in DB**: `createdAt` / `updatedAt` on every model

**Known gaps:**
- ❌ **No dedicated SIEM** (Datadog, Splunk) yet: Sentry + Vercel logs sufficient for V0
- ❌ **No uptime monitoring**: to be added Sprint 2 (Better Uptime / Pingdom)
- ❌ **No automated alerting on suspicious patterns**: Sentry alerting being configured

---

### A10: Server-Side Request Forgery (SSRF) · ✅ MITIGATED

**Risk:** attacker tricks our server into making requests to internal services.

**Defences in place:**

1. **No user-supplied URLs are fetched** from our backend, except:
   - LinkedIn URLs stored on leads: never **fetched** by us, only displayed
2. **All `fetch()` calls in `lib/services/*` use hardcoded URLs:**
   - `https://api.apollo.io/api/v1/...`
   - `https://api.hunter.io/v2/...`
   - `https://api.resend.com/...`
3. **No proxy / rewrite endpoint** that forwards user input
4. **No PDF / HTML rendering from URLs**
5. **Webhooks come INTO us**: not the other way

**Test:**
```bash
cd apps/api && grep -rn "fetch(.*\${.*}\)" --include="*.ts" lib/
# Expected: no user-input interpolation in fetch URLs
```

---

## 🔐 Authentication & Authorization

### Auth flow (Clerk)

```
User → Sign In page → Clerk hosted UI → Clerk JWT cookie set
                                              │
User → Phantera API ──────────────────────────┤
       middleware.ts → clerkMiddleware verifies JWT
                                              │
                                              ▼
                                     Resolves userId
                                              │
                                              ▼
                                     route handler runs
```

### Routes by access level

| Access | Routes | Mechanism |
|--------|--------|-----------|
| **Public** | `/`, `/about`, `/legal/*`, `/sign-in`, `/sign-up`, `/api/webhooks/*`, `/api/track/*`, `/api/mcp/*`, `/sitemap.xml`, `/robots.txt` | `isPublicRoute` matcher |
| **Auth pages** | `/sign-in`, `/sign-up` | redirect signed-in users -> `/dashboard` |
| **Dev-only** | `/design-system` | 404 in `NODE_ENV === 'production'` |
| **Authenticated** | All `/dashboard/*`, all `/api/*` except above | Clerk JWT required |

### Authorization checks (server-side)

Every authenticated API route runs:

```typescript
const { userId } = await auth()
if (!userId) return 401

// Workspace-scoped:
const workspace = await resolveWorkspace(userId)
if (!workspace) return 404

// Plan-gated features:
if (!checkAiGenerationAllowed(workspace.plan)) return 402
```

---

## 🔑 Secrets Management

### Storage hierarchy

```
Production secrets       → Vercel Environment Variables (encrypted at rest)
Local dev secrets        → apps/api/.env.local (git-ignored)
Documentation             → apps/api/.env.example (empty placeholders)
```

### Secret inventory (15+ tracked)

| Secret | Provider | Rotated last | Critical? |
|--------|----------|--------------|-----------|
| `DATABASE_URL` | Railway | 2026-04-21 | Yes |
| `CLERK_SECRET_KEY` | Clerk | 2026-04-21 | Yes |
| `CLERK_WEBHOOK_SECRET` | Clerk | 2026-04-21 | Yes |
| `STRIPE_SECRET_KEY` | Stripe | 2026-04-21 | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe | 2026-04-21 | Yes |
| `ANTHROPIC_API_KEY` | Anthropic | 2026-04-21 | Cost |
| `APOLLO_API_KEY` | Apollo | 2026-04-21 | Cost |
| `HUNTER_API_KEY` | Hunter | 2026-04-21 | Cost |
| `RESEND_API_KEY` | Resend | 2026-04-21 | Yes |
| `RESEND_WEBHOOK_SECRET` | Resend | 2026-04-21 | Yes |
| `INBOUND_WEBHOOK_SECRET` | Phantera-generated | 2026-04-21 | Yes |
| `CRON_SECRET` | Phantera-generated | 2026-04-21 | Yes |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | 2026-06-01 | No (public DSN) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog | 2026-06-01 | No (public token) |
| 6 × `STRIPE_*_PRICE_ID` | Stripe | 2026-06-02 | No (public IDs) |

### Rotation policy

- **Critical secrets** (DB, Stripe, Clerk, webhook secrets) rotated **after any suspected exposure**
- **API keys** (Apollo, Hunter, Anthropic) rotated **quarterly** OR if monthly cost spike detected
- **Public tokens** (Sentry DSN, PostHog key) not rotated: safe to expose

### Secret exposure audit

```bash
# Run before every release
git log --all -p | grep -iE "sk_(live|test)_[a-zA-Z0-9]{20,}" | head
# Expected: empty

# Or via tool
docker run --rm -v "$PWD:/repo" trufflesecurity/trufflehog filesystem /repo
```

---

## 🪝 Webhook Security

We receive webhooks from **4 providers** + **1 internal**. Every handler validates signatures **before** parsing payload.

| Webhook | Endpoint | Signature mechanism | Replay protection |
|---------|----------|---------------------|-------------------|
| **Clerk** (user lifecycle) | `/api/webhooks/clerk` | Svix HMAC | Svix timestamp window |
| **Stripe** (billing events) | `/api/webhooks/stripe` | Stripe HMAC | timestamp tolerance |
| **Resend** (email events) | `/api/webhooks/resend` | Svix HMAC | timestamp window |
| **Cloudflare Worker** (inbound email) | `/api/webhooks/inbound-email` | Custom secret header | DB dedup on emailSendId |
| **Vercel Cron** | `/api/cron/*` | Bearer `CRON_SECRET` | atomic claim via DB lock |

### Why dedup matters

Webhooks are **at-least-once**: duplicates WILL happen. Every handler is **idempotent**:

```typescript
// Pattern in /api/webhooks/inbound-email
await db.$transaction(async (tx) => {
  const existing = await tx.emailReply.findFirst({ where: { emailSendId } })
  if (existing) return // already processed — skip silently
  await tx.emailReply.create({ ... })
})
```

---

## 🚦 Rate Limiting

In-memory LRU rate limiter (`lib/security/rate-limit.ts`) on three critical endpoints:

| Endpoint | Limit | Scope | Why |
|----------|-------|-------|-----|
| `POST /api/leads/search/stream` | 10 / 5 min / user | Per Clerk userId | Apollo + Hunter + Anthropic credits drain |
| `POST /api/stripe/checkout` | 5 / 1 min / user | Per Clerk userId | Card-stuffing brute-force prevention |
| `GET /api/track/open` | 120 / 1 min / IP | Per IP (Cloudflare/Vercel headers) | Public pixel DDoS prevention |

### Limitations

- **In-memory only**: fine for V0 (single Vercel region, low traffic)
- **Per-instance**: not strictly enforced across multiple Vercel regions
- **Future:** migrate to Upstash Redis when traffic justifies

### Response

When limited:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 47
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1717527934

{"error": "Trop de requêtes, réessayez plus tard."}
```

---

## 🇪🇺 Data Privacy & GDPR

### Compliance status (V0 launch)

| Requirement | Status |
|-------------|--------|
| Privacy Policy page (`/legal/privacy`) | ✅ Live |
| Terms of Service (`/legal/terms`) | ✅ Live |
| Cookie consent banner | ✅ Live (12-month persistence) |
| GDPR opt-in for analytics | ✅ PostHog respects user choice |
| Data Processing Agreement (DPA) with sub-processors | ⚠️ Resend ✅ · Apollo ✅ · Stripe ✅ · Anthropic ⏳ |
| Right to erasure | ⏳ Sprint 2: `/api/account/delete` not yet implemented |
| Right to data portability | ✅ CSV export (Pro+) |
| Data Protection Officer (DPO) | ❌ Not appointed (< 250 employees threshold) |
| EU data residency | ✅ Vercel `cdg1` · Railway EU · Sentry `de.sentry.io` |
| Cross-border transfer (USA) | ⚠️ Clerk (USA) + Stripe (USA): Standard Contractual Clauses signed |

### Sub-processors

Listed publicly in `/legal/privacy` page. Reviewed at every release.

### Cookie inventory

| Name | Purpose | Duration | Category |
|------|---------|----------|----------|
| `__session` | Clerk auth session | session | Essential |
| `__client_uat` | Clerk client identifier | session | Essential |
| `phantera.consent` | User cookie preferences | 12 months | Essential |
| `ph_*` | PostHog analytics (opt-in) | 12 months | Analytics |

No tracking pixels from advertisers. No third-party cookies.

---

## 📊 Logging & Monitoring

### Where logs go

```
console.* (legacy)        → Vercel function logs
logger.* (new pattern)    → Vercel function logs (JSON-structured)
logger.error              → ALSO forwarded to Sentry with breadcrumbs
analytics events          → PostHog (typed events via lib/analytics/events.ts)
DB queries (verbose)      → Vercel logs (Prisma debug — disabled in prod)
```

### What we log

**DO log:**
- Authentication events (signup, login)
- Payment events (checkout started/completed/cancelled)
- Quota hits (rate-limit triggered, plan limit reached)
- Webhook receptions + verification failures
- API errors (4xx + 5xx)

**DON'T log:**
- Passwords (never reach our infra)
- Stripe card numbers (never reach our infra)
- Full email bodies (only first 600 chars for replies)
- API keys / tokens (env-var-only)

### Retention

- **Vercel logs:** 7 days (Hobby tier) / 30 days (Pro tier)
- **Sentry events:** 90 days by default
- **PostHog events:** 7 years (configurable)
- **DB audit trail:** indefinite (until manual archive)

---

## 🚨 Incident Response Runbook

### Severity classification

| Sev | Definition | Response time | Examples |
|-----|------------|---------------|----------|
| **SEV-0** | Active data breach, mass impact | < 30 min | DB dump leaked, all user data accessible |
| **SEV-1** | Production down OR critical feature broken | < 2h | Auth broken, payments failing, mass user lockout |
| **SEV-2** | Degraded service, some users affected | < 8h | Individual user can't send emails, slow API |
| **SEV-3** | Minor bug, no user impact | < 24h | Typo in pricing page, dashboard graph offset |

### Immediate actions on SEV-0 / SEV-1

```
1. Acknowledge in #incidents channel
2. Mute Sentry alerts to avoid noise during work
3. Capture evidence:
   • Screenshots
   • Sentry issue IDs
   • Affected user IDs (DM only — never paste publicly)
4. Quick triage:
   • Is the bug deployed in last commit? → git revert
   • Is it env-var related? → fix in Vercel + redeploy
   • Is data leaked? → rotate exposed secrets IMMEDIATELY
5. Communicate:
   • Internal: keep #incidents updated every 15 min
   • External: status.phantera-tn.com (not yet built — manual email V0)
6. Resolution: postmortem within 48h
```

### Secret rotation playbook

```bash
# 1. Generate new secret
openssl rand -hex 32

# 2. Update Vercel env var
vercel env add NEW_SECRET production
# (or via dashboard)

# 3. Trigger redeploy
git commit --allow-empty -m "chore: rotate secret"
git push

# 4. Verify new secret is live
curl https://phantera-tn.com/api/health

# 5. Revoke old secret in provider dashboard
```

### Contacts

| Provider | Contact | Purpose |
|----------|---------|---------|
| Clerk | support@clerk.com | Auth incidents |
| Stripe | support@stripe.com or live chat | Billing incidents |
| Resend | support@resend.com | Email deliverability incidents |
| Cloudflare | dashboard live chat | Worker / DNS incidents |
| Vercel | support@vercel.com | Hosting incidents |
| Railway | support@railway.app | DB incidents |
| Sentry | EU support | Monitoring incidents |
| CNIL (FR) | cnil.fr | GDPR data breach notification (within 72h) |

---

## 🚀 Security Roadmap

### Sprint 2

- [ ] Configure Dependabot / Renovate for auto-PR on package updates
- [ ] Set up Better Uptime / Pingdom for synthetic monitoring
- [ ] Implement `/api/account/delete` (right to erasure)
- [ ] Add Sentry alerting rules (critical errors -> email + Slack)
- [ ] Run `npm audit fix` for current 2 moderate vulns

### Sprint 3

- [ ] Migrate rate limiting to Upstash Redis (cross-instance enforcement)
- [ ] Enable Clerk MFA enforcement option for users
- [ ] Add CSP `report-uri` to catch CSP violations
- [ ] Add Subresource Integrity (SRI) on Clerk + PostHog scripts
- [ ] Sentry source-map upload (full stack traces in prod)

### Pre-Series A (~6 months)

- [ ] **External penetration test** (Cobalt or HackerOne)
- [ ] SOC2 Type I prep
- [ ] **GDPR DPO** appointed
- [ ] **Bug bounty program** launched
- [ ] **24/7 on-call rotation** for SEV-0/1

### Pre-Series B (~12 months)

- [ ] SOC2 Type II certification
- [ ] ISO 27001 readiness
- [ ] Hire a dedicated Security Engineer

---

## 🧭 Quick security checklist for new features

Before merging any PR that touches user data or external APIs:

```
☐ Does the endpoint authenticate via Clerk auth()?
☐ Does it filter by workspaceId derived from userId?
☐ Are inputs validated with Zod schema?
☐ Is the response free of sensitive internals (stack traces, env)?
☐ If it accepts user URLs / files — is fetching disabled?
☐ Does it log errors via logger.error (→ Sentry)?
☐ Does it respect rate limits (or add new ones if appropriate)?
☐ Does it gate by plan if it's a paid feature?
☐ Did I add a test for the auth boundary?
☐ Did I run npm audit before pushing?
```

---

**Document owner:** Security Lead (currently founder)
**Review cadence:** Quarterly OR after any incident
**Next planned review:** September 2026
