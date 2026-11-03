/**
 * /dashboard/inbox: Reply Inbox UI
 *
 * Surfaces lead replies (Agent 5 outputs) that until now lived in the DB
 * but had no UI. Plan-gated: requires BUSINESS or ENTERPRISE (data and
 * gate: GET /api/views/inbox).
 */
import { redirect } from 'next/navigation'
import { Check, Lock } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { InboxPageClient } from '@/components/dashboard/inbox/InboxPageClient'
import { loadView } from '@/lib/front/server-api'

interface InboxPageProps {
  searchParams: Promise<{ filter?: string; page?: string }>
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const { filter, page } = await searchParams
  const view = await loadView('views.inbox', { query: { filter, page } })
  if ('redirectTo' in view) redirect(view.redirectTo)

  // ── Plan gate: Reply Inbox is BUSINESS+ feature ──────────────────────────
  if (view.locked) {
    return <InboxLockedView price={view.businessPrice} annualDiscount={view.businessAnnualDiscount} />
  }

  return (
    <DashboardShell>
      <InboxPageClient
        replies={view.replies}
        total={view.total}
        page={view.page}
        totalPages={view.totalPages}
        filter={view.filter}
      />
    </DashboardShell>
  )
}

// ─── Locked view (FREE / PRO) ────────────────────────────────────────────────

const LOCKED_PERKS = [
  'Réponses e-mail et LinkedIn réunies',
  "Classement par l'IA avec indice de confiance",
  "Réponse préparée dans votre messagerie, message d'origine cité",
  'Filtres : positives, rendez-vous, négatives, non lues',
] as const

// Price and annual discount come from the view (computed from the plan table
// on the server; discount 0 = no annual option in Stripe).
function InboxLockedView({ price, annualDiscount }: { price: number; annualDiscount: number }) {
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
          Passer à Business : <span className="ml-1 font-mono tabular-nums">{price} €</span>/mois
        </Link>
        <p className="mt-3 font-mono text-xs tabular-nums text-muted">
          {annualDiscount > 0 ? `-${annualDiscount} % en annuel, ` : ''}sans engagement
        </p>
      </div>
    </DashboardShell>
  )
}
