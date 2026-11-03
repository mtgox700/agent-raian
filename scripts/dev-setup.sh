#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Phantera: local environment in one command (phase 0 of docs/ROADMAP_HEADLESS.md).
#
#   bash scripts/dev-setup.sh                 # Postgres from docker compose
#   DATABASE_URL=postgresql://… bash scripts/dev-setup.sh   # any other Postgres
#
# Idempotent: keeps existing .env.local files and an existing schema.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=apps/api/.env.local
FRONT_ENV=apps/front/.env.local
DEFAULT_DB=postgresql://phantera:phantera@localhost:5432/phantera

# 1. Database
if [ -z "${DATABASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "▶ Starting Postgres (docker compose)"
  docker compose up -d --wait db
  DATABASE_URL=$DEFAULT_DB
fi
export DATABASE_URL DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

# 2. .env.local from the template, with local values and fresh secrets
if [ ! -f "$ENV_FILE" ]; then
  echo "▶ Creating $ENV_FILE"
  rand() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
  sed -e "s#^DATABASE_URL=.*#DATABASE_URL=\"$DATABASE_URL\"#" \
      -e "s#^DIRECT_URL=.*#DIRECT_URL=\"$DIRECT_URL\"#" \
      -e "s#^ENCRYPTION_KEY=.*#ENCRYPTION_KEY=\"$(rand)\"#" \
      -e "s#^CRON_SECRET=.*#CRON_SECRET=\"$(rand)\"#" \
      -e "s#^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=.*#NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\"\"#" \
      -e "s#^CLERK_SECRET_KEY=.*#CLERK_SECRET_KEY=\"\"#" \
      -e "s#^CLERK_WEBHOOK_SECRET=.*#CLERK_WEBHOOK_SECRET=\"\"#" \
      -e "/^NODE_ENV=/d" \
      apps/api/env.local.template > "$ENV_FILE"
fi

# The front needs the public Clerk key and where the API runs; it shares the brand.
if [ ! -f "$FRONT_ENV" ]; then
  echo "▶ Creating $FRONT_ENV"
  {
    echo "# Front (apps/front): talks to the API through /api/*, rewritten to API_URL."
    echo "API_URL=\"http://localhost:3001\""
    grep -E '^(NEXT_PUBLIC_[A-Z_]+|CLERK_SECRET_KEY)=' "$ENV_FILE"
  } > "$FRONT_ENV"
fi

# 3. Dependencies and Prisma client
echo "▶ Installing dependencies"
npm ci --no-audit --no-fund
(cd apps/api && npx prisma generate >/dev/null)

# 4. Schema: bootstrap an empty database, otherwise apply pending migrations
TABLES=$(node -e "
const { Client } = require('pg'); const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => c.query(\"select count(*)::int n from information_schema.tables where table_schema='public'\"))
 .then(r => { console.log(r.rows[0].n); return c.end() }).catch(e => { console.error(e.message); process.exit(1) })" 2>&1)
if [ "$TABLES" = "0" ]; then
  echo "▶ Empty database: bootstrap"
  (cd apps/api && node scripts/db-bootstrap.mjs)
else
  echo "▶ Applying pending migrations"
  (cd apps/api && npx prisma migrate deploy)
fi

echo
echo "✅ Ready. Next:"
echo "   1. Clerk keys in $ENV_FILE and $FRONT_ENV (dashboard.clerk.com, a free dev instance) to sign in"
echo "   2. npm run dev                      → front http://localhost:3000, API http://localhost:3001"
echo "   3. npx inngest-cli@latest dev       → sequences, inbox polling, housekeeping"
echo "   Without other keys, providers run on deterministic mocks."
