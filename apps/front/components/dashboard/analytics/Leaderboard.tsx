'use client'

/**
 * Campaigns as a forest plot: each rate as a point with its interval on a
 * common scale, the pooled rate as a reference line. Ranked by the lower
 * bound, so luck on a small sample cannot win.
 */

import Link from 'next/link'
import type { LeaderRow } from '@/lib/analytics/build'
import type { Rate } from '@/lib/analyst/facts/campaign'
import { ci, nf, pct } from './ChartFrame'

function Verdict({ row }: { row: LeaderRow }) {
  if (!row.verdict || row.verdict === 'insuffisant' || !row.direction) return <span className="text-[11px] text-muted">dans la moyenne</span>
  const proven = row.verdict === 'significatif'
  const tone = proven ? (row.direction === 'au-dessus' ? 'border-success-fg/40 text-success-fg' : 'border-danger/40 text-danger') : 'border-warning/40 text-warning'
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {row.direction === 'au-dessus' ? 'au-dessus' : 'en dessous'}{proven ? '' : ', à surveiller'}
    </span>
  )
}

export function Leaderboard({ ranked, insufficient, pooled }: { ranked: LeaderRow[]; insufficient: LeaderRow[]; pooled: Rate }) {
  const max = Math.max(0.05, ...ranked.map((r) => r.rate.ci.high), pooled.rate) * 1.1
  const x = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  return (
    <div>
      <ol className="space-y-2.5">
        {ranked.map((r) => (
          <li key={r.campaignId} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-3">
            <Link href={`/dashboard/campaigns/${r.campaignId}`} className="truncate text-xs font-semibold text-white hover:text-cyan">{r.name}</Link>
            <div className="relative h-6" role="img" aria-label={`${r.name} : ${pct(r.rate)}, intervalle ${ci(r.rate)}, ${nf(r.rate.n)} leads`}>
              <div className="absolute inset-y-0 w-px bg-white/25" style={{ left: x(pooled.rate) }} aria-hidden="true" />
              <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-cyan/35" style={{ left: x(r.rate.ci.low), width: `calc(${x(r.rate.ci.high)} - ${x(r.rate.ci.low)})` }} />
              <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-void bg-cyan" style={{ left: x(r.rate.rate) }} />
            </div>
            <div className="flex items-center gap-2 text-[11px] tabular-nums text-muted sm:justify-end">
              <span className="font-semibold text-white">{pct(r.rate)}</span>
              <span>{nf(r.rate.successes)}/{nf(r.rate.n)}</span>
              <Verdict row={r} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
        <span className="inline-block h-3 w-px bg-white/40" aria-hidden="true" /> moyenne de toutes ces campagnes : {pct(pooled)} ({nf(pooled.successes)}/{nf(pooled.n)})
      </p>
      {insufficient.length > 0 && (
        <details className="mt-3 rounded-[10px] border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-muted">{insufficient.length} campagne{insufficient.length > 1 ? 's' : ''} avec moins de 30 leads mesurables, non classée{insufficient.length > 1 ? 's' : ''}</summary>
          <ul className="mt-2 space-y-1 text-xs text-white/80">
            {insufficient.map((r) => <li key={r.campaignId} className="flex justify-between gap-3"><span className="truncate">{r.name}</span><span className="tabular-nums text-muted">{nf(r.rate.successes)}/{nf(r.rate.n)}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
