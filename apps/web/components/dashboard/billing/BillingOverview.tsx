'use client'

import { Calendar } from 'lucide-react'
import type { Plan } from '@prisma/client'
import { cn } from '@/lib/utils'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { StatusBadge } from '@/components/ui/status-badge'

/** Bar tone from usage: healthy, needs a look, nearly full. */
function usageTone(pct: number): { bar: string; text: string } {
  if (pct >= 90) return { bar: 'bg-danger', text: 'text-danger' }
  if (pct >= 60) return { bar: 'bg-warning', text: 'text-white' }
  return { bar: 'bg-success-fg', text: 'text-white' }
}

function UsageMeter({
  label,
  current,
  limit,
}: {
  label: string
  current: number
  limit: number | null
}) {
  const isUnlimited = limit === null || limit === Infinity
  const pct = isUnlimited ? 0 : Math.min((current / limit) * 100, 100)
  const tone = usageTone(pct)
  const value = isUnlimited
    ? `${current.toLocaleString('fr-FR')} sur illimité`
    : `${current.toLocaleString('fr-FR')} / ${limit.toLocaleString('fr-FR')}`

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">{label}</span>
        <span className={cn('font-mono text-xs tabular-nums', isUnlimited ? 'text-white' : tone.text)}>{value}</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
        role={isUnlimited ? undefined : 'meter'}
        aria-label={isUnlimited ? undefined : label}
        aria-valuemin={isUnlimited ? undefined : 0}
        aria-valuemax={isUnlimited ? undefined : limit}
        aria-valuenow={isUnlimited ? undefined : Math.min(current, limit)}
      >
        {!isUnlimited && (
          <div
            className={cn('h-full w-full origin-left rounded-full transition-transform duration-200 ease-signal', tone.bar)}
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        )}
      </div>
      {!isUnlimited && pct >= 90 && (
        <p className="mt-1 font-mono text-[11px] text-danger">{current > limit ? 'Limite dépassée' : current === limit ? 'Limite atteinte' : 'Limite presque atteinte'}</p>
      )}
    </div>
  )
}

interface BillingOverviewProps {
  plan: Plan
  stripeCurrentPeriodEnd: Date | null
  campaignsUsed: number
  campaignsLimit: number | null
  leadsUsed: number
  leadsLimit: number | null
}

export function BillingOverview({
  plan,
  stripeCurrentPeriodEnd,
  campaignsUsed,
  campaignsLimit,
  leadsUsed,
  leadsLimit,
}: BillingOverviewProps) {
  const renewDate = stripeCurrentPeriodEnd
    ? new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(stripeCurrentPeriodEnd)
    : null

  return (
    <div className="rounded-[10px] border border-border bg-obsidian p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted">Offre actuelle</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-display text-lg font-semibold tracking-[-0.02em] text-white">
              {PLAN_CONFIG[plan].name}
            </span>
            {plan !== 'FREE' && <StatusBadge tone="success">Active</StatusBadge>}
          </div>
        </div>

        {renewDate && (
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-[11px] text-muted">
            <Calendar className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            Renouvellement le {renewDate}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <p className="font-mono text-xs text-muted">Utilisation</p>
        <UsageMeter
          label="Campagnes (actives, en pause, brouillons)"
          current={campaignsUsed}
          limit={campaignsLimit}
        />
        <UsageMeter
          label="Leads ce mois"
          current={leadsUsed}
          limit={leadsLimit}
        />
      </div>
    </div>
  )
}
