'use client'

/**
 * EmailHealthWidget: what happened to the e-mails sent over 30 days.
 *
 * Each rate is shown with the base it is taken on (sent for delivery,
 * delivered for opens and clicks), in French format, and no target: the
 * product has no sourced benchmark to compare against. Opens are measured
 * by pixel, so they are indicative.
 */

import { Mail } from 'lucide-react'
import { formatPercent } from '@/lib/format/percent'
import type { EmailHealth } from '@/lib/services/dashboard.service'

const nf = (n: number) => n.toLocaleString('fr-FR')
const delivered = (n: number) => `${nf(n)} e-mail${n > 1 ? 's délivrés' : ' délivré'}`

// ─── One measured rate ────────────────────────────────────────────────────────

interface RateRowProps {
  label: string
  note?: string
  value: number
  /** The number the rate is taken on; 0 means nothing to measure yet. */
  base:  number
  basis: string
}

function RateRow({ label, note, value, base, basis }: RateRowProps) {
  const measured = base > 0
  const width = measured ? Math.min(Math.max(value, 0), 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-white">
          {label}
          {note && <span className="ml-1.5 font-mono text-[11px] font-normal text-muted">{note}</span>}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-white">
          {measured ? formatPercent(value) : 'Pas encore de données'}
        </span>
      </div>

      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-surface"
        role="img"
        aria-label={measured ? `${label} : ${formatPercent(value)}, ${basis}` : `${label} : pas encore de données`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-cyan transition-[width] duration-200 ease-signal motion-reduce:transition-none"
          style={{ width: `${width}%` }}
        />
      </div>

      {measured && <p className="font-mono text-[11px] tabular-nums text-muted">{basis}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface EmailHealthWidgetProps {
  data: EmailHealth
}

export function EmailHealthWidget({ data }: EmailHealthWidgetProps) {
  const deliveredCount = Math.max(data.sentCount - data.bounceCount, 0)
  const bounceRate = data.sentCount > 0 ? (data.bounceCount / data.sentCount) * 100 : 0

  return (
    <div className="flex flex-col rounded-[10px] border border-border bg-obsidian p-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-cyan" aria-hidden="true" />
          <span className="font-mono text-xs font-medium text-white">
            Santé des envois
          </span>
        </div>

        <span className="font-mono text-xs text-muted">30 derniers jours</span>
      </div>

      {data.sentCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-border bg-surface">
            <Mail className="h-5 w-5 text-muted" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-white">Aucun e-mail envoyé</p>
            <p className="mt-0.5 text-xs text-muted">
              Les mesures apparaîtront après votre première campagne
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <RateRow
            label="Livraison"
            value={data.deliveryRate}
            base={data.sentCount}
            basis={`${delivered(deliveredCount)} sur ${nf(data.sentCount)} envoyés`}
          />
          <RateRow
            label="Ouverture"
            note="indicative, mesure par pixel"
            value={data.openRate}
            base={deliveredCount}
            basis={`sur ${delivered(deliveredCount)}`}
          />
          <RateRow
            label="Clic"
            value={data.clickRate}
            base={deliveredCount}
            basis={`sur ${delivered(deliveredCount)}`}
          />

          {/* Footer counts */}
          <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <div className="flex flex-col-reverse">
              <dt className="font-mono text-[11px] text-muted">Envoyés</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-white">{nf(data.sentCount)}</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="font-mono text-[11px] text-muted">Rebonds</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-white">{nf(data.bounceCount)}</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="font-mono text-[11px] text-muted">Taux de rebond</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-white">{formatPercent(bounceRate)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
