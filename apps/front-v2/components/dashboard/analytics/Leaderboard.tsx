/**
 * Campaigns as a forest plot: each rate as a point with its interval on a
 * common scale, the pooled rate as a reference line. Ranked by the lower
 * bound, so luck on a small sample cannot win.
 */

import Link from 'next/link'
import { analyticsCopy } from '@/lib/copy/analytics'
import type { LeaderRow, Rate } from '@/lib/front/types-analytics'
import { cn } from '@/lib/utils'
import { ci, nf, pct, VERDICT_TONE } from './format'
import { IntervalBar } from './IntervalBar'

const t = analyticsCopy.leaderboard

function Verdict({ row }: { row: LeaderRow }) {
  if (!row.verdict || row.verdict === 'insuffisant' || !row.direction) return <span className="text-[11px] text-quiet">{t.average}</span>
  const proven = row.verdict === 'significatif'
  const tone = proven ? (row.direction === 'au-dessus' ? VERDICT_TONE.good : VERDICT_TONE.bad) : VERDICT_TONE.watch
  return (
    <span className={cn('rounded-full border px-2 py-0.5 font-mono text-[11px]', tone)}>
      {row.direction === 'au-dessus' ? t.above : t.below}{proven ? '' : t.watchSuffix}
    </span>
  )
}

export function Leaderboard({ ranked, insufficient, pooled }: { ranked: LeaderRow[]; insufficient: LeaderRow[]; pooled: Rate }) {
  const max = Math.max(0.05, ...ranked.map((r) => r.rate.ci.high), pooled.rate) * 1.1
  return (
    <div>
      <ol className="space-y-2.5">
        {ranked.map((r) => (
          <li key={r.campaignId} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-3">
            <Link href={`/dashboard/campaigns/${r.campaignId}`} className="truncate text-xs font-medium text-ink transition-colors duration-200 ease-signal hover:text-accent">{r.name}</Link>
            <IntervalBar rate={r.rate} max={max} reference={pooled.rate} label={analyticsCopy.common.pointLabel(r.name, pct(r.rate), ci(r.rate), nf(r.rate.n))} />
            <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-quiet sm:justify-end">
              <span className="font-semibold text-ink">{pct(r.rate)}</span>
              <span>{nf(r.rate.successes)}/{nf(r.rate.n)}</span>
              <Verdict row={r} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-center gap-2 text-[11px] text-quiet">
        <span className="inline-block h-3 w-px bg-ink/40" aria-hidden="true" /> {t.pooled(pct(pooled), nf(pooled.successes), nf(pooled.n))}
      </p>
      {insufficient.length > 0 && (
        <details className="mt-3 rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-quiet">{t.insufficient(insufficient.length)}</summary>
          <ul className="mt-2 space-y-1 text-xs text-ink/80">
            {insufficient.map((r) => <li key={r.campaignId} className="flex justify-between gap-3"><span className="truncate">{r.name}</span><span className="font-mono tabular-nums text-quiet">{nf(r.rate.successes)}/{nf(r.rate.n)}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
