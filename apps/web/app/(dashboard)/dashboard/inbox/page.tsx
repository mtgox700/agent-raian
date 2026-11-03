/**
 * /dashboard/inbox: Reply Inbox UI
 *
 * Surfaces lead replies (Agent 5 outputs) that until now lived in the DB
 * but had no UI. Plan-gated: requires BUSINESS or ENTERPRISE.
 */
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Check, Lock } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { requireAccess } from '@/lib/auth/access'
import { listReplies, type ReplyFilter } from '@/lib/repositories/replies.repository'
import { InboxPageClient } from '@/components/dashboard/inbox/InboxPageClient'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

interface InboxPageProps {
  searchParams: Promise<{ filter?: string; page?: string }>
}

const PAGE_SIZE = 25
const PRO_PLUS_PLANS = new Set(['BUSINESS', 'ENTERPRISE'])
const REPLY_FILTERS: ReplyFilter[] = ['all', 'positive', 'meeting', 'negative', 'unread']

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const workspaceAccess = await requireAccess(userId, 'inbox.read')
  if (!workspaceAccess.ok) redirect('/onboarding')
  const workspace = workspaceAccess.ctx

  // ── Plan gate: Reply Inbox is BUSINESS+ feature ──────────────────────────
  if (!PRO_PLUS_PLANS.has(workspace.plan)) {
    return <InboxLockedView />
  }

  const params = await searchParams
  // An unknown ?filter= used to crash the empty state; fall back to all.
  const filter = REPLY_FILTERS.find((f) => f === params.filter) ?? 'all'
  const requestedPage = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  let result = await listReplies({
    scope: workspace,
    filter,
    page: requestedPage,
    pageSize: PAGE_SIZE,
  })
  // A page past the end (after replies were read or filtered) shows the last one.
  if (result.rows.length === 0 && requestedPage > result.totalPages) {
    result = await listReplies({
      scope: workspace,
      filter,
      page: result.totalPages,
      pageSize: PAGE_SIZE,
    })
  }
  const { rows, total, totalPages } = result
  const page = Math.min(requestedPage, totalPages)

  return (
    <DashboardShell>
      <InboxPageClient
        replies={rows.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() }))}
        total={total}
        page={page}
        totalPages={totalPages}
        filter={filter}
      />
    </DashboardShell>
  )
}

// ─── Locked view (FREE / PRO) ────────────────────────────────────────────────

// Annual discount computed from the plan table, never written by hand, and
// only announced when an annual price exists in Stripe (null = no annual option).
const BUSINESS_ANNUAL_DISCOUNT = PLAN_CONFIG.BUSINESS.stripeAnnualPriceId
  ? Math.round((1 - PLAN_CONFIG.BUSINESS.annualPrice / (PLAN_CONFIG.BUSINESS.price * 12)) * 100)
  : 0

const LOCKED_PERKS = [
  'Réponses e-mail et LinkedIn réunies',
  "Classement par l'IA avec indice de confiance",
  "Réponse préparée dans votre messagerie, message d'origine cité",
  'Filtres : positives, rendez-vous, négatives, non lues',
] as const

function InboxLockedView() {
  return (
    <DashboardShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[10px] border border-border bg-obsidian">
          <Lock className="h-5 w-5 text-gold" aria-hidden="true" />
        </div>

        <p className="mb-2 font-mono text-xs text-muted">Formule Business</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Réponses
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          Toutes les réponses de vos prospects au même endroit, classées
          automatiquement (positive, rendez-vous, négative, pas
          intéressé). Chaque réponse s&apos;ouvre avec le prospect, sa campagne
          et le message auquel il répond.
        </p>

        <ul className="mt-6 grid max-w-md grid-cols-1 gap-2 text-left sm:grid-cols-2">
          {LOCKED_PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-xs text-muted">
              <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-cyan" aria-hidden="true" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/dashboard/settings?tab=billing"
          className={buttonVariants({ variant: 'default', className: 'mt-8' })}
        >
          Passer à Business : <span className="ml-1 font-mono tabular-nums">{PLAN_CONFIG.BUSINESS.price} €</span>/mois
        </Link>
        <p className="mt-3 font-mono text-xs tabular-nums text-muted">
          {BUSINESS_ANNUAL_DISCOUNT > 0 ? `-${BUSINESS_ANNUAL_DISCOUNT} % en annuel, ` : ''}sans engagement
        </p>
      </div>
    </DashboardShell>
  )
}
