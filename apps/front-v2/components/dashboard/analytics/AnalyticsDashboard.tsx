'use client'

/**
 * Analytics. Every figure comes with the number of leads behind it and its
 * interval; a change is only called a change when a test says so. Filters
 * live in the URL (?p=30d&c=…&vs=…): a view can be shared, and survives a reload.
 */

import { useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button, Skeleton } from '@/components/ui'
import { filtersQuery, PERIODS } from '@/lib/analytics/filters'
import { analyticsCopy as t, type PeriodKey } from '@/lib/copy/analytics'
import type { AnalyticsReport } from '@/lib/front/types-analytics'
import { cn } from '@/lib/utils'
import { CampaignPicker } from './CampaignPicker'
import { ChartFrame } from './ChartFrame'
import { ComparisonPanel } from './ComparisonPanel'
import { KpiStrip } from './KpiStrip'
import { Leaderboard } from './Leaderboard'
import { StepFunnel } from './StepFunnel'
import { CalibrationPanel, ChannelsPanel, HeatmapPanel } from './PlainPanels'
import { AnnotationList, MatrixPanel, PipelinePanel, SegmentsPanel, TrianglePanel } from './AudiencePanels'
import { ci, dayLabel, nf, pct } from './format'

// Recharts is loaded in the browser only, after the page is painted.
const ChartSkeleton = ({ h }: { h: string }) => <Skeleton className={cn(h, 'w-full rounded-lg')} />
const CohortChart = dynamic(() => import('./charts').then((m) => m.CohortChart), { ssr: false, loading: () => <ChartSkeleton h="h-64" /> })
const MailboxCards = dynamic(() => import('./charts').then((m) => m.MailboxCards), { ssr: false, loading: () => <ChartSkeleton h="h-40" /> })
const DelayChart = dynamic(() => import('./charts').then((m) => m.DelayChart), { ssr: false, loading: () => <ChartSkeleton h="h-56" /> })
const MixChart = dynamic(() => import('./charts').then((m) => m.MixChart), { ssr: false, loading: () => <ChartSkeleton h="h-56" /> })

const PERIOD_KEYS = Object.keys(PERIODS) as PeriodKey[]

function segmentVerdict(s: AnalyticsReport['segments']['breakdowns'][number]['segments'][number]): string {
  if (s.pooled) return t.common.notTested
  if (s.rate.n < 30) return t.common.under30
  if (s.verdict === 'insuffisant' || !s.direction) return t.segments.noGap
  return `${s.direction}${s.verdict === 'tendance' ? t.segments.watchSuffix : ''}`
}

export function AnalyticsDashboard({ report }: { report: AnalyticsReport }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const go = (period: PeriodKey, ids: string[], vs: string[] = report.versus) =>
    startTransition(() => router.push(`/dashboard/analytics${filtersQuery(period, ids, vs.filter((id) => !ids.includes(id)))}`))

  const reply = report.kpis.find((k) => k.key === 'reply')
  const noData = report.campaigns.length === 0 || (report.kpis.find((k) => k.key === 'contacted')?.value ?? 0) === 0
  const lb = report.leaderboard
  const measured = report.cohorts.reduce((a, c) => a + c.rate.n, 0)
  const segmentsMeasured = report.segments.breakdowns[0]?.measured ?? 0

  return (
    <div className="space-y-5">
      {/* Filters: period, campaigns, comparison side. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pending && <Loader2 className="h-4 w-4 animate-spin text-accent motion-reduce:animate-none" role="status" aria-label={t.updating} />}
        <div className="flex rounded-md border border-line p-0.5" role="group" aria-label={t.periodGroup}>
          {PERIOD_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => go(k, report.selected)}
              aria-pressed={report.period === k}
              disabled={pending}
              className={cn(
                'min-h-[32px] rounded-[5px] px-3 font-mono text-[11px] transition-colors duration-200 ease-signal',
                report.period === k ? 'bg-accent/15 text-accent' : 'text-quiet hover:text-ink',
              )}
            >
              {t.period[k]}
            </button>
          ))}
        </div>
        <CampaignPicker campaigns={report.campaigns} selected={report.selected} onApply={(ids) => go(report.period, ids)} disabled={pending} />
        <CampaignPicker
          campaigns={report.campaigns.filter((c) => !report.selected.includes(c.id))}
          selected={report.versus}
          onApply={(ids) => go(report.period, report.selected, ids)}
          disabled={pending}
          emptyLabel={t.picker.versusEmpty}
          clearLabel={t.picker.versusClear}
          prefix={t.picker.versusPrefix}
        />
      </div>

      {noData ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="text-sm font-medium text-ink">{t.empty.title(t.period[report.period])}</p>
          <p className="mt-1 text-sm text-quiet">{t.empty.body}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {report.period !== '90d' && <Button size="sm" onClick={() => go('90d', report.selected)} disabled={pending}>{t.empty.see90}</Button>}
            {report.selected.length > 0 && <Button size="sm" variant="outline" onClick={() => go(report.period, [])} disabled={pending}>{t.empty.allCampaigns}</Button>}
          </div>
        </div>
      ) : (
        <>
          {report.comparison && <ComparisonPanel comparison={report.comparison} days={report.days} onClose={() => go(report.period, report.selected, [])} disabled={pending} />}
          <KpiStrip kpis={report.kpis} days={report.days} />

          <ChartFrame
            id="tendance"
            question={t.trend.question}
            method={t.trend.method}
            n={t.trend.n(nf(measured))}
            empty={report.cohorts.length === 0 ? t.trend.empty : null}
            table={[[...t.trend.table], ...report.cohorts.map((c) => [dayLabel(c.week), nf(c.contacted), nf(c.mature) + (c.provisional ? t.trend.inProgress : ''), c.rate.n ? pct(c.rate) : t.common.nd, c.rate.n ? ci(c.rate) : ''])]}
          >
            <CohortChart points={report.cohorts} annotations={report.annotations} />
            <p className="mt-2 text-[11px] text-quiet">{t.trend.note}</p>
            <AnnotationList weeks={report.annotations} firstWeek={report.cohorts[0]?.week ?? null} />
          </ChartFrame>

          <ChartFrame
            id="cohortes"
            question={t.triangle.question}
            method={t.triangle.method}
            n={t.triangle.n(nf(report.triangle.weeks.reduce((a, w) => a + w.contacted, 0)))}
            empty={report.triangle.weeks.length === 0 ? t.triangle.empty : null}
            table={[
              [t.common.weekOf, t.triangle.contacted, ...report.triangle.days.map((d) => t.triangle.day(d))],
              ...report.triangle.weeks.map((w) => [dayLabel(w.week), nf(w.contacted), ...w.cells.map((c) => (c.state === 'pending' ? t.triangle.tooRecent : `${t.triangle.cell(pct(c.rate), c.rate.successes, c.rate.n)}${c.state === 'partial' ? t.triangle.partial : ''}`))]),
            ]}
          >
            <TrianglePanel triangle={report.triangle} />
          </ChartFrame>

          <ChartFrame
            id="campagnes"
            question={t.leaderboard.question}
            method={t.leaderboard.method}
            n={reply?.rate ? t.common.leadsMeasured(nf(lb.pooled.n)) : undefined}
            empty={lb.ranked.length === 0 && lb.insufficient.length === 0 ? t.leaderboard.empty : null}
            table={[
              [...t.leaderboard.table],
              ...lb.ranked.map((r) => [r.name, pct(r.rate), `${r.rate.successes}/${r.rate.n}`, ci(r.rate), r.verdict ?? t.common.notTested]),
              ...lb.insufficient.map((r) => [r.name, pct(r.rate), `${r.rate.successes}/${r.rate.n}`, ci(r.rate), t.common.under30]),
            ]}
          >
            <Leaderboard ranked={lb.ranked} insufficient={lb.insufficient} pooled={lb.pooled} />
          </ChartFrame>

          <ChartFrame
            id="pipeline"
            question={t.pipeline.question}
            method={t.pipeline.method}
            empty={report.pipeline.length === 0 ? t.pipeline.empty : null}
            table={[[...t.pipeline.table], ...report.pipeline.map((s) => [s.label, nf(s.count), s.ofContacted ? pct(s.ofContacted) : '', s.ofContacted ? ci(s.ofContacted) : '', s.medianDays === null ? '' : String(s.medianDays)])]}
          >
            <PipelinePanel stages={report.pipeline} />
          </ChartFrame>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartFrame
              id="etapes"
              question={t.steps.question}
              method={t.steps.method}
              empty={report.steps.length === 0 ? t.steps.empty : null}
              table={[[...t.steps.table], ...report.steps.map((s) => [String(s.position), s.channel, nf(s.reached), s.pending ? t.steps.pending : pct(s.replyRate), s.pending ? '' : ci(s.replyRate), nf(s.bounced)])]}
            >
              <StepFunnel steps={report.steps} />
            </ChartFrame>

            <ChartFrame
              id="delivrabilite"
              question={t.mailboxes.question}
              method={t.mailboxes.method}
              empty={report.mailboxes.length === 0 ? t.mailboxes.empty : null}
              table={[[...t.mailboxes.table], ...report.mailboxes.map((b) => [b.label, pct(b.bounce), nf(b.bounce.n), b.level])]}
            >
              <MailboxCards boxes={report.mailboxes} />
              <p className="mt-2 text-[11px] text-quiet">{t.mailboxes.note}</p>
            </ChartFrame>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartFrame
              id="delai"
              question={t.delay.question}
              method={t.delay.method}
              n={t.delay.n(nf(report.delay.events), nf(report.delay.leads))}
              empty={report.delay.enough ? null : t.delay.notEnough(nf(report.delay.events))}
              table={[[...t.delay.table], ...report.delay.points.map((pt) => {
                const r = { successes: 0, n: 1, rate: pt.replied, ci: pt.ci }
                return [t.delay.day(pt.t), pct(r), ci(r)]
              })]}
            >
              <DelayChart curve={report.delay} />
              {report.delay.marks.length > 0 && (
                <p className="mt-2 font-mono text-[11px] text-ink/85">{report.delay.marks.map((m) => t.delay.mark(m.day, Math.round(m.share * 100))).join(' · ')}</p>
              )}
            </ChartFrame>

            <ChartFrame
              id="score"
              question={t.calibration.question}
              method={t.calibration.method}
              n={t.common.leadsMeasured(nf(report.calibration.badges.reduce((a, b) => a + b.rate.n, 0)))}
              empty={report.calibration.badges.length === 0 ? t.calibration.empty : null}
              table={[[...t.calibration.table], ...report.calibration.badges.map((b) => [b.badge, pct(b.rate), `${b.rate.successes}/${b.rate.n}`, ci(b.rate)])]}
            >
              <CalibrationPanel data={report.calibration} />
            </ChartFrame>
          </div>

          <ChartFrame
            id="segments"
            question={t.segments.question}
            method={t.segments.method}
            n={t.common.leadsMeasured(nf(segmentsMeasured))}
            empty={report.segments.breakdowns.every((b) => !b.comparable) ? (segmentsMeasured ? t.segments.allSame : t.segments.empty) : null}
            table={[
              [...t.segments.table],
              ...report.segments.breakdowns.filter((b) => b.comparable).flatMap((b) => b.segments.map((s) => [b.title, s.label, pct(s.rate), `${s.rate.successes}/${s.rate.n}`, ci(s.rate), segmentVerdict(s)])),
            ]}
          >
            <SegmentsPanel breakdowns={report.segments.breakdowns} singleCampaign={report.segments.singleCampaign} />
          </ChartFrame>

          <ChartFrame
            id="matrice"
            question={t.matrix.question}
            method={t.matrix.method}
            empty={report.segments.matrix.columns.length === 0 ? t.matrix.empty : null}
            table={[
              [t.matrix.level, ...report.segments.matrix.columns.map((c) => c.label)],
              ...report.segments.matrix.rows.map((r) => [r.label, ...r.cells.map((c) => (c.rate.n ? t.triangle.cell(pct(c.rate), c.rate.successes, c.rate.n) : ''))]),
            ]}
          >
            <MatrixPanel matrix={report.segments.matrix} />
          </ChartFrame>

          <ChartFrame
            id="reponses"
            question={t.mix.question}
            method={t.mix.method}
            n={t.mix.n(nf(report.mix.reduce((a, w) => a + w.total, 0)))}
            empty={report.mix.length === 0 ? t.mix.empty : null}
            table={[[...t.mix.table], ...report.mix.map((w) => [dayLabel(w.week), nf(w.positive), nf(w.neutral), nf(w.negative), nf(w.total)])]}
          >
            <MixChart weeks={report.mix} />
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-quiet">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-signal" aria-hidden="true" /> {t.mix.legend.positive}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-quiet/50" aria-hidden="true" /> {t.mix.legend.neutral}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger/75" aria-hidden="true" /> {t.mix.legend.negative}</span>
              <span>{t.mix.legendNote}</span>
            </p>
          </ChartFrame>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <ChartFrame
              id="horaires"
              question={t.heatmap.question}
              method={t.heatmap.method}
              empty={report.heatmap.totalSent === 0 ? t.heatmap.empty : null}
              table={[
                [...t.heatmap.table],
                ...report.heatmap.sent
                  .flatMap((row, d) => row.map((sent, h) => ({ d, h, sent, replied: report.heatmap.replied[d]?.[h] ?? 0 })))
                  .filter((c) => c.sent || c.replied)
                  .map((c) => [t.heatmap.dow[c.d], t.heatmap.hour(c.h), nf(c.sent), nf(c.replied)]),
              ]}
            >
              <HeatmapPanel grid={report.heatmap} />
            </ChartFrame>

            <ChartFrame
              id="canaux"
              question={t.channels.question}
              method={t.channels.method}
              empty={report.channels.length === 0 ? t.channels.empty : null}
              table={[[...t.channels.table], ...report.channels.map((c) => [c.channel, nf(c.reached), c.rate ? pct(c.rate) : t.channels.notMeasured, c.rate ? ci(c.rate) : ''])]}
            >
              <ChannelsPanel channels={report.channels} />
            </ChartFrame>
          </div>
        </>
      )}
    </div>
  )
}
