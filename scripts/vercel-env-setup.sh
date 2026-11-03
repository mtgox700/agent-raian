#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Phantera — Vercel environment variables setup
# Run ONCE after `vercel link` (from the repo root) to push the env vars.
# Usage: bash scripts/vercel-env-setup.sh
# Reference for every variable: apps/web/env.local.template
# ─────────────────────────────────────────────────────────────────────────────

set -e

source apps/web/.env.local 2>/dev/null || { echo "❌ apps/web/.env.local not found"; exit 1; }

echo "🚀 Setting Vercel environment variables..."

ALL="production preview development"

add_env() {
  local key=$1 value=$2 envs=${3:-$ALL}
  if [ -z "$value" ]; then
    echo "  ⚠️  Skipping $key (empty)"
    return
  fi
  for env in $envs; do
    printf '%s' "$value" | vercel env add "$key" "$env" --force >/dev/null 2>&1 \
      && echo "  ✓ $key ($env)" || echo "  ✗ $key ($env) failed"
  done
}

# ── Database: production only. The build runs `prisma migrate deploy`; previews
#    must point at their own database (e.g. a Neon branch), never at prod.
add_env "DATABASE_URL" "$DATABASE_URL" "production"
add_env "DIRECT_URL"   "$DIRECT_URL"   "production"

# ── Clerk ────────────────────────────────────────────────────────────────────
add_env "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
add_env "CLERK_SECRET_KEY" "$CLERK_SECRET_KEY"
add_env "NEXT_PUBLIC_CLERK_SIGN_IN_URL" "/sign-in"
add_env "NEXT_PUBLIC_CLERK_SIGN_UP_URL" "/sign-up"
add_env "NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL" "/dashboard"
add_env "NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL" "/onboarding"
add_env "CLERK_WEBHOOK_SECRET" "$CLERK_WEBHOOK_SECRET"

# ── App secrets ──────────────────────────────────────────────────────────────
add_env "ENCRYPTION_KEY" "$ENCRYPTION_KEY" "production"
add_env "CRON_SECRET"    "$CRON_SECRET"    "production"

# ── LLM ──────────────────────────────────────────────────────────────────────
add_env "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"
add_env "OLLAMA_API_KEY"    "$OLLAMA_API_KEY"

# ── Durable execution (Inngest drives sequences, inbox polling, housekeeping)
add_env "INNGEST_EVENT_KEY"   "$INNGEST_EVENT_KEY"   "production"
add_env "INNGEST_SIGNING_KEY" "$INNGEST_SIGNING_KEY" "production"
add_env "UPSTASH_REDIS_REST_URL"   "$UPSTASH_REDIS_REST_URL"
add_env "UPSTASH_REDIS_REST_TOKEN" "$UPSTASH_REDIS_REST_TOKEN"

# ── Email ────────────────────────────────────────────────────────────────────
add_env "RESEND_API_KEY"         "$RESEND_API_KEY"
add_env "RESEND_WEBHOOK_SECRET"  "$RESEND_WEBHOOK_SECRET"
add_env "RESEND_FROM_EMAIL"      "$RESEND_FROM_EMAIL"
add_env "INBOUND_WEBHOOK_SECRET" "$INBOUND_WEBHOOK_SECRET"

# ── Stripe ───────────────────────────────────────────────────────────────────
add_env "STRIPE_SECRET_KEY"     "$STRIPE_SECRET_KEY"
add_env "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET"
for v in STRIPE_PRO_PRICE_ID STRIPE_PRO_ANNUAL_PRICE_ID STRIPE_BUSINESS_PRICE_ID STRIPE_BUSINESS_ANNUAL_PRICE_ID \
         STRIPE_ENTERPRISE_PRICE_ID STRIPE_ENTERPRISE_ANNUAL_PRICE_ID STRIPE_ACTIVE_CONTACTS_METER; do
  add_env "$v" "${!v}"
done

# ── Observability ────────────────────────────────────────────────────────────
add_env "NEXT_PUBLIC_SENTRY_DSN"   "$NEXT_PUBLIC_SENTRY_DSN"
add_env "NEXT_PUBLIC_POSTHOG_KEY"  "$NEXT_PUBLIC_POSTHOG_KEY"
add_env "NEXT_PUBLIC_POSTHOG_HOST" "$NEXT_PUBLIC_POSTHOG_HOST"

echo ""
echo "✅ Done. Still to set by hand:"
echo "   • NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_API_URL → the production URL"
echo "   • Optional providers (Apollo, Hunter, Unipile, Google/Microsoft OAuth…): see apps/web/env.local.template"
echo "   • Webhook secrets once the URLs exist (Clerk, Stripe, Resend, Unipile)"
