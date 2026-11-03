'use client'

/**
 * Comparison mode: two groups of campaigns side by side, each gap tested,
 * and what differs between them besides the message said plainly.
 */

import { X } from 'lucide-react'
import { analyticsCopy } from '@/lib/copy/analytics'
import type { ComparedMeasure, GroupComparison } from '@/lib/front/types-analytics'
import { cn } from '@/lib/utils'
import { ci, nf, pct, VERDICT_TONE } from './format'

const t = analyticsCopy.comparison

/** A gap in percentage points, signed: "+3,4 pt". */
const NBSP = String.fromCharCode(160)
const points = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${(Math.abs(v) * 100).toFixed(1).replace('.', ',')}${NBSP}pt`

/** The side marker: never the colour alone (accent and signal are not told apart by everyone). */
function Side({ side }: { side: 'A' | 'B' }) {
  return <span className={cn('mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded font-mono text-[9px] font-bold text-canvas', side === 'A' ? 'bg-accent' : 'bg-signal')} aria-hidden="true">{side}</span>
}

function Verdict({ m }: { m: ComparedMeasure }) {
  const c = m.comparison
  if (m.a.n < 30 || m.b.n < 30) return <span className="text-[11px] text-quiet">{t.fewSide}</span>
  if (c.verdict === 'significatif') {
    // For bounces, higher is worse.
    const better = m.key === 'bounce' ? c.delta < 0 : c.delta > 0
    return <span className={cn('w-fit rounded-full border px-2 py-0.5 font-mono text-[11px]', better ? VERDICT_TONE.good : VERDICT_TONE.bad)}>{t.proven}</span>
  }
  if (c.verdict === 'tendance') return <span className={cn('w-fit rounded-full border px-2 py-0.5 font-mono text-[11px]', VERDICT_TONE.watch)}>{t.watch}</span>
  return <span className="text-[11px] text-quiet">{t.noGap}</span>
}

export function ComparisonPanel({ comparison, days, onClose, disabled }: { comparison: GroupComparison; days: number; onClose: () => void; disabled?: boolean }) {
  const { a, b, measures, differences } = comparison
  return (
    <section aria-labelledby="comparaison-title" className="rounded-lg border border-accent/30 bg-raised p-4 md:p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="comparaison-title" className="font-display text-base font-semibold text-ink">
            <Side side="A" /><span className="text-accent">{a.label}</span>{t.versus}<Side side="B" /><span className="text-signal">{b.label}</span>
          </h2>
          <p className="mt-0.5 text-xs text-quiet">{t.method(days)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={disabled}
          aria-label={t.close}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {measures.length === 0 ? (
        <p className="text-sm text-quiet">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {measures.map((m) => (
            <li key={m.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,10rem)_1fr_1fr_minmax(0,9rem)_auto] sm:items-center sm:gap-4">
              <span className="text-xs font-medium text-ink">{m.label}</span>
              <span className="font-mono text-xs tabular-nums text-ink/85"><Side side="A" /><span className="sr-only">{a.label} : </span><span className="font-semibold text-accent">{pct(m.a)}</span> <span className="text-quiet">({nf(m.a.successes)}/{nf(m.a.n)}, {analyticsCopy.common.ci(ci(m.a))})</span></span>
              <span className="font-mono text-xs tabular-nums text-ink/85"><Side side="B" /><span className="sr-only">{b.label} : </span><span className="font-semibold text-signal">{pct(m.b)}</span> <span className="text-quiet">({nf(m.b.successes)}/{nf(m.b.n)}, {analyticsCopy.common.ci(ci(m.b))})</span></span>
              <span className="font-mono text-xs tabular-nums text-ink/85" title={t.gapTitle(points(m.comparison.deltaCi.low), points(m.comparison.deltaCi.high))}>
                {t.gap(points(m.comparison.delta))}
              </span>
              <Verdict m={m} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-quiet">
        {differences.length > 0 ? t.differences(differences.join(', ')) : t.same}
        {a.campaigns + b.campaigns > 2 && t.mixed}
      </p>
    </section>
  )
}
