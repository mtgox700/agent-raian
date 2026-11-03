'use client'

/**
 * Comparison mode: two groups of campaigns side by side, each gap tested,
 * and what differs between them besides the message said plainly.
 */

import { X } from 'lucide-react'
import type { ComparedMeasure, GroupComparison } from '@/lib/analytics/compare-groups'
import { ci, nf, pct } from './ChartFrame'

/** A gap in percentage points, signed: "+3,4 pt". */
const NBSP = String.fromCharCode(160)
const points = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${(Math.abs(v) * 100).toFixed(1).replace('.', ',')}${NBSP}pt`

/** The side marker: never the colour alone (cyan and gold are not told apart by everyone). */
function Side({ side }: { side: 'A' | 'B' }) {
  return <span className={`mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-void ${side === 'A' ? 'bg-cyan' : 'bg-gold'}`} aria-hidden="true">{side}</span>
}

function Verdict({ m }: { m: ComparedMeasure }) {
  const c = m.comparison
  if (m.a.n < 30 || m.b.n < 30) return <span className="text-[11px] text-muted">moins de 30 leads d’un côté</span>
  if (c.verdict === 'significatif') {
    // For bounces, higher is worse.
    const better = m.key === 'bounce' ? c.delta < 0 : c.delta > 0
    return <span className={`w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold ${better ? 'border-success-fg/40 text-success-fg' : 'border-danger/40 text-danger'}`}>écart démontré</span>
  }
  if (c.verdict === 'tendance') return <span className="w-fit rounded-full border border-warning/40 px-2 py-0.5 text-[11px] font-semibold text-warning">à surveiller</span>
  return <span className="text-[11px] text-muted">pas d’écart démontré</span>
}

export function ComparisonPanel({ comparison, days, onClose }: { comparison: GroupComparison; days: number; onClose: () => void }) {
  const { a, b, measures, differences } = comparison
  return (
    <section aria-labelledby="comparaison-title" className="rounded-[10px] border border-cyan/25 bg-cyan/[0.03] p-4 md:p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="comparaison-title" className="font-display text-base font-bold text-white">
            <Side side="A" /><span className="text-cyan">{a.label}</span> face à <Side side="B" /><span className="text-gold">{b.label}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">leads contactés pour la première fois sur les {days} derniers jours ; réponses à J+7, IC 95 % de Wilson</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Quitter la comparaison" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-white/[0.05] hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </header>

      {measures.length === 0 ? (
        <p className="text-sm text-muted">Pas encore de leads mesurables à 7 jours d’un des deux côtés.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {measures.map((m) => (
            <li key={m.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,10rem)_1fr_1fr_minmax(0,9rem)_auto] sm:items-center sm:gap-4">
              <span className="text-xs font-semibold text-white">{m.label}</span>
              <span className="text-xs tabular-nums text-white/85"><Side side="A" /><span className="sr-only">{a.label} : </span><span className="font-semibold text-cyan">{pct(m.a)}</span> <span className="text-muted">({nf(m.a.successes)}/{nf(m.a.n)}, IC {ci(m.a)})</span></span>
              <span className="text-xs tabular-nums text-white/85"><Side side="B" /><span className="sr-only">{b.label} : </span><span className="font-semibold text-gold">{pct(m.b)}</span> <span className="text-muted">({nf(m.b.successes)}/{nf(m.b.n)}, IC {ci(m.b)})</span></span>
              <span className="text-xs tabular-nums text-white/85" title={`écart de ${points(m.comparison.deltaCi.low)} à ${points(m.comparison.deltaCi.high)}`}>
                écart A - B : {points(m.comparison.delta)}
              </span>
              <Verdict m={m} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {differences.length > 0
          ? `Les deux côtés ne diffèrent pas que par le message : ${differences.join(', ')}. Un écart peut venir de là, il reste à surveiller.`
          : 'Mêmes boîtes d’envoi, même ciblage, cohortes du même âge : un écart démontré peut être attribué au message.'}
        {a.campaigns + b.campaigns > 2 && ' Plusieurs campagnes par côté : leurs messages sont mêlés.'}
      </p>
    </section>
  )
}
