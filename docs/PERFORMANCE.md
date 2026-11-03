# ⚡ Phantera: Performance Guide

> **Targets:** Lighthouse ≥ 90 on Performance · Accessibility · Best Practices · SEO
>
> **Last audited:** June 2, 2026

---

## 📋 Table of Contents

1. [Performance Targets](#-performance-targets)
2. [Core Web Vitals](#-core-web-vitals)
3. [What's Already Optimised](#-whats-already-optimised)
4. [Critical Render Path](#-critical-render-path)
5. [Bundle Size Budget](#-bundle-size-budget)
6. [Lighthouse CI](#-lighthouse-ci)
7. [Manual Audit Procedure](#-manual-audit-procedure)
8. [Performance Roadmap](#-performance-roadmap)

---

## 🎯 Performance Targets

| Page | Performance | Accessibility | Best Practices | SEO |
|------|:-----------:|:-------------:|:--------------:|:---:|
| `/` (landing) | ≥ 90 | ≥ 95 | ≥ 95 | ≥ 95 |
| `/about` | ≥ 90 | ≥ 95 | ≥ 95 | ≥ 90 |
| `/sign-in` | ≥ 85 | ≥ 95 | ≥ 95 | ≥ 85 |
| `/dashboard` | ≥ 80 | ≥ 90 | ≥ 90 | n/a |
| `/dashboard/leads` | ≥ 75 | ≥ 90 | ≥ 90 | n/a |

**Why lower targets on dashboard?** Auth-gated · runtime data loading · 3rd-party SDKs (Clerk + PostHog + Sentry). 80+ is realistic and acceptable when the user is already signed in.

---

## 🌐 Core Web Vitals

Google's user-facing KPIs. Failing these hurts SEO directly.

| Metric | Target | What it measures |
|--------|:------:|------------------|
| **LCP**: Largest Contentful Paint | < 2.5s | Time until largest above-fold element renders |
| **CLS**: Cumulative Layout Shift | < 0.1 | Visual stability (no jumping) |
| **INP**: Interaction to Next Paint | < 200ms | Responsiveness to user input |
| **FCP**: First Contentful Paint | < 1.8s | Time until anything renders |
| **TTFB**: Time to First Byte | < 0.8s | Server response time |

### How to measure in production

```bash
# Real-user monitoring (RUM) via Vercel Speed Insights — already enabled
# Lighthouse CI runs on every PR (see .github/workflows/lighthouse.yml)

# Manual one-off audit
npx lighthouse https://phantera-tn.com --view --preset=desktop
npx lighthouse https://phantera-tn.com --view --form-factor=mobile
```

---

## ✅ What's Already Optimised

Below is the **complete inventory** of perf optimisations active in production. Don't undo any of these without measuring the impact first.

### 1. Next.js framework optimisations

```javascript
// apps/api/next.config.js

experimental: {
  // Inline critical above-the-fold CSS — reduces render-blocking resources
  optimizeCss: true,

  // Tree-shake heavy packages at compile time
  optimizePackageImports: [
    'framer-motion',          // ~80kb savings
    'lucide-react',           // ~40kb savings
    'recharts',
    '@tanstack/react-query',
    '@radix-ui/react-accordion',
    '@radix-ui/react-slot',
  ],
}

compress:        true,        // gzip + brotli on Vercel edge
poweredByHeader: false,       // strip "X-Powered-By: Next.js" header
reactStrictMode: true,        // catch hidden perf bugs in dev
```

### 2. Image optimisation

```javascript
images: {
  formats: ['image/avif', 'image/webp'],   // modern formats first
  minimumCacheTTL: 31536000,               // 1 year cache
}
```

**Rules:**
- Use `<Image>` from `next/image`, never raw `<img>`
- Always specify `width` / `height` to prevent CLS
- Use `priority` only on above-fold images (max 1 per page)
- Use `loading="lazy"` (default) for below-fold images

### 3. Font loading

```typescript
// apps/front/app/layout.tsx

const syne  = Syne({  subsets: ['latin'], weight: ['700','800'], display: 'swap', preload: true })
const inter = Inter({ subsets: ['latin'], weight: ['300','400','500'], display: 'swap', preload: true })
const orbitron = Orbitron({ subsets: ['latin'], weight: ['700','900'], display: 'swap', preload: false })  // hero only
```

- **`display: 'swap'`** -> renders fallback immediately, swaps when font loads (FOUT > FOIT)
- **`preload: true`** only on critical fonts: Orbitron is opt-in for hero animations
- **Subset to `latin`** -> ~50% size reduction

### 4. Static assets via Vercel CDN

- All assets in `/public/` served from Vercel Edge Network
- Automatic asset hashing -> 1-year `immutable` cache headers
- HTTP/3 + QUIC enabled by default

### 5. Server Components by default

- **All routes** are Server Components unless explicitly marked `'use client'`
- -> less JS shipped to browser
- -> faster Time-to-Interactive

Currently `'use client'` files: ~50 (interactive components only).

### 6. Code splitting

- Each route is a separate bundle
- Heavy components (e.g. `CampaignWizard`) split into per-step chunks
- Dynamic imports for non-critical features (`PostHogIdentify`, `PageLoader`)

### 7. Lazy hydration via `ClientShell`

```typescript
// apps/front/components/effects/ClientShell.tsx
const LenisProvider  = dynamic(() => import('./LenisProvider'), { ssr: false })
const CustomCursor   = dynamic(() => import('@/components/marketing/CustomCursor'), { ssr: false })
const ScrollProgress = dynamic(() => import('@/components/marketing/ScrollProgress'), { ssr: false })
const PageLoader     = dynamic(() => import('@/components/brand/PageLoader'), { ssr: false })
```

-> Decorative client-only features don't block the initial page render.

### 8. Database query optimisation

- **30+ indexes** in Prisma schema covering all common WHERE clauses
- **`select` clauses** on every query: never `SELECT *`
- **`take` limits** on every list query
- **Connection pooling** via Prisma + Railway pgBouncer
- **No N+1 queries**: Prisma `include` used for relations

### 9. Edge runtime where it makes sense

- Static / marketing routes -> Edge runtime
- Auth-gated dashboard routes -> Node.js runtime (Prisma needs Node)
- Webhooks -> Node.js runtime (signature verification)

### 10. Strict security headers (zero perf cost)

```
HSTS preload                     → no HTTP redirect cost on repeat visits
Content-Security-Policy          → prevents XSS-driven script bloat
Referrer-Policy strict-origin    → minimal headers leaked
```

---

## 🎬 Critical Render Path

What renders **before** anything else on the landing page (`/`):

```
0ms                100ms              500ms              1500ms
├─────────────────┼──────────────────┼──────────────────┼──────────
│                 │                  │                  │
│ HTML doc        │ Critical CSS     │ Hero text + svg  │ Hydration
│ (Vercel edge)   │ (inlined via     │ (server-rendered)│ + animations
│                 │  optimizeCss)    │                  │ start
│                 │                  │ ★ LCP target     │
│                 │                  │   (≤ 2500ms)     │
```

### Above-the-fold critical components

```
app/page.tsx (Server Component)
   ├── Navbar           (Server — static markup)
   └── Hero             (Server — main copy + SVG)
        ↑
        LCP element here
```

**Avoid in above-fold:**
- ❌ Lottie animations
- ❌ Heavy JS (framer-motion mounted)
- ❌ External fonts not preloaded
- ❌ Hero `<video autoplay>`

---

## 📦 Bundle Size Budget

Maximum allowed sizes (gzipped):

| Bundle | Budget | Why |
|--------|:------:|-----|
| First Load JS (landing) | < 200 kB | Below mobile 3G threshold |
| First Load JS (dashboard) | < 350 kB | Acceptable for auth-gated app |
| CSS (all pages) | < 50 kB | Tailwind purge keeps this tight |
| Per route chunk | < 50 kB | Code-split should be aggressive |

### How to check

```bash
cd apps/api
npm run build
# Look for: ┌ Route (app)
#          Size  First Load JS
# Anything > budget = investigate

# Detailed analysis
npx @next/bundle-analyzer
```

### Common offenders

| Package | Size | Mitigation |
|---------|:----:|------------|
| `framer-motion` | 80 kB | Already tree-shaken via `optimizePackageImports` |
| `recharts` | 100 kB | Lazy-loaded: only on analytics page |
| `lucide-react` | 40 kB | Tree-shaken (only used icons bundled) |
| `mailparser` | 600 kB+ | Server-only: never reaches browser |
| `@anthropic-ai/sdk` | 500 kB | Server-only |
| `posthog-js` | 80 kB | Loaded async + behind cookie consent |

---

## 🤖 Lighthouse CI

Automated Lighthouse runs on every PR via GitHub Actions.

### Workflow

`.github/workflows/lighthouse.yml` runs `lhci autorun` against the deployed preview URL.

### Config

`apps/api/lighthouserc.json` defines:
- URLs to audit (home, about, sign-in, pricing)
- Score thresholds per category
- 3 runs per URL (median is used -> stable scores)
- Settings: mobile + desktop preset

### How thresholds work

```
PR triggers Vercel preview deploy
        │
        ▼
Lighthouse CI job runs
        │
        ▼
For each URL × 3 runs → median LH score
        │
        ▼
Compare against thresholds
        │
        ├── Score below threshold → ❌ PR check fails (advisory only)
        └── All scores pass       → ✅ PR check passes
```

> **Note:** failing Lighthouse is advisory in V0 (does not block merge) to avoid blocking critical bug fixes. Will become blocking in Sprint 3 once we have stable baselines.

### Running locally

```bash
cd apps/api
npx @lhci/cli@latest autorun --config=./lighthouserc.json
```

---

## 🔧 Manual Audit Procedure

Run this before every major release.

### Step 1: Production audit (real device)

```bash
# Desktop
npx lighthouse https://phantera-tn.com \
    --view \
    --preset=desktop \
    --only-categories=performance,accessibility,best-practices,seo

# Mobile (simulated 4G)
npx lighthouse https://phantera-tn.com \
    --view \
    --form-factor=mobile \
    --throttling.cpuSlowdownMultiplier=4 \
    --throttling.rttMs=150 \
    --throttling.throughputKbps=1638.4
```

### Step 2: Real user monitoring

Vercel Speed Insights dashboard:
- https://vercel.com/<your-team>/phantera/speed-insights
- Look at P75 metrics (75th percentile = most users)
- Filter by country if scaling internationally

### Step 3: Check Core Web Vitals via Google Search Console

- https://search.google.com/search-console
- Core Web Vitals report
- Identifies pages failing in Google's eyes (= SEO impact)

### Step 4: Investigate regressions

If a metric regresses:

```
1. Check bundle size: npm run build → diff against last release
2. Check 3rd-party scripts: PostHog, Sentry, Clerk weight
3. Check images: new hero / OG image too heavy?
4. Check fonts: new font family added without preload?
5. Check critical CSS: optimizeCss still active?
```

---

## 🚀 Performance Roadmap

### Sprint 2 (Quick wins)

- [ ] Add Vercel Analytics + Speed Insights (full RUM)
- [ ] Add `<link rel="preconnect">` for Apollo / Hunter API origins
- [ ] Audit hero SVG: convert to optimised path
- [ ] Switch Tiger image (landing) to AVIF format
- [ ] Add `font-display: optional` for Orbitron (non-critical)

### Sprint 3 (Medium effort)

- [ ] **Replace `gsap` + `lenis` with framer-motion only**: saves ~40 KB
- [ ] **Convert `recharts` -> lightweight alternative** (or load on demand)
- [ ] **Implement React Server Components for analytics page**: defer client JS
- [ ] **Add Redis cache layer** for dashboard initial query
- [ ] Sentry source-map upload (better stack traces, no perf cost)

### Sprint 4+ (Architectural)

- [ ] **Edge runtime migration** for read-only API routes
- [ ] **Streaming SSR** for dashboard (Suspense boundaries)
- [ ] **Partial Prerendering (PPR)**: Next.js 16 experimental
- [ ] **HTTP/3 + early hints**: push critical CSS before HTML
- [ ] **Service worker** for offline / instant repeat visits

---

## ✋ Anti-patterns to avoid

Before writing new code that risks perf:

```
❌ Adding new heavy npm packages without measuring bundle impact
❌ Using <img> instead of <Image> from next/image
❌ Forgetting width/height on images (causes CLS)
❌ Using JS animations where CSS transitions would do
❌ Loading 3rd-party scripts synchronously in <head>
❌ Putting client logic in Server Components (forces 'use client')
❌ Querying DB inside loops (N+1)
❌ Returning full Prisma objects (use `select`)
❌ Skipping ESLint warnings about hooks dependencies
❌ Disabling Next.js optimisations to "fix" a bug
```

---

## 🧭 Performance investigation checklist

When a page feels slow:

```
☐ Run Lighthouse on the page (mobile + desktop)
☐ Check Vercel function logs for slow API responses
☐ Check Sentry transactions for slow Prisma queries
☐ Check Network tab in DevTools: what's blocking?
☐ Profile with React DevTools Profiler
☐ Check the React tree: any unnecessary re-renders?
☐ Check bundle size with @next/bundle-analyzer
☐ Look for "use client" creep on Server Component routes
```

---

**Document owner:** Frontend lead
**Review cadence:** Every quarter OR after any major release
