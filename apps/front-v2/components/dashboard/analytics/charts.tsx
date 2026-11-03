'use client'

/**
 * The Recharts charts of the analytics page, in one module loaded on demand
 * (next/dynamic in AnalyticsDashboard): the library stays out of the page's
 * first load. Colours come from the theme variables only: signal for replies
 * (a person), accent for sends and bounces (the machine), neutrals for grids
 * and campaign events.
 */

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BOUNCE_WATCH } from '@/lib/analytics/filters'
import { analyticsCopy } from '@/lib/copy/analytics'
import type { AnnotatedWeek, CohortPoint, DelayCurve, MailboxHealth, MixWeek } from '@/lib/front/types-analytics'
import { Badge, type BadgeTone } from '@/components/ui'
import { p, weekLabel } from './format'

const AXIS = { fontSize: 10, fill: 'rgb(var(--c-muted))', fontFamily: 'var(--font-mono, monospace)' }
const GRID = 'rgb(var(--c-border))'
const TIP = { background: 'rgb(var(--c-obsidian))', border: '1px solid rgb(var(--c-border))', borderRadius: 6, fontSize: 12, color: 'rgb(var(--c-white))' }
const TIP_LABEL = { color: 'rgb(var(--c-muted))', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }
const TIP_ITEM = { color: 'rgb(var(--c-white))' }
const REPLY = 'rgb(var(--c-gold))'
const SEND = 'rgb(var(--c-cyan))'
const EVENT = 'rgb(var(--c-white) / 0.55)'

export function CohortChart({ points, annotations = [] }: { points: CohortPoint[]; annotations?: AnnotatedWeek[] }) {
  const t = analyticsCopy.trend
  const weeks = new Set(points.map((c) => c.week))
  // A marker only on a week the chart shows: Recharts places it on the category.
  const marks = annotations.filter((a) => weeks.has(a.week))
  const data = points.map((c) => ({
    week: weekLabel(c.week),
    rate: c.rate.n > 0 ? c.rate.rate : null,
    band: c.rate.n > 0 ? [c.rate.ci.low, c.rate.ci.high] : null,
    n: c.rate.n,
    contacted: c.contacted,
    provisional: c.provisional,
  }))
  // The axis holds the whole band, not just the line.
  const top = Math.max(0.05, ...points.filter((c) => c.rate.n > 0).map((c) => c.rate.ci.high)) * 1.1
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: marks.length ? 20 : 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="week" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis domain={[0, top]} tickFormatter={(v: number) => `${Math.round(v * 100)} %`} tick={AXIS} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            contentStyle={TIP}
            labelStyle={TIP_LABEL}
            itemStyle={TIP_ITEM}
            formatter={(value, name, item) => {
              const d = item.payload as (typeof data)[number]
              if (name === 'band' && Array.isArray(value)) return [`${p(value[0] as number)} à ${p(value[1] as number)}`, t.tipBand]
              return [t.tipValue(p(value as number), d.n, d.provisional), t.tipRate]
            }}
          />
          <Area dataKey="band" stroke="none" fill={REPLY} fillOpacity={0.15} isAnimationActive={false} />
          {marks.map((a) => (
            <ReferenceLine key={a.week} x={weekLabel(a.week)} stroke={EVENT} strokeDasharray="3 3" label={{ value: String(a.events.length), position: 'top', fill: EVENT, fontSize: 10 }} />
          ))}
          <Line dataKey="rate" stroke={REPLY} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

const LEVEL_TONE: Record<MailboxHealth['level'], BadgeTone> = { ok: 'success', vigilance: 'warning', danger: 'danger', insuffisant: 'neutral' }

export function MailboxCards({ boxes }: { boxes: MailboxHealth[] }) {
  const t = analyticsCopy.mailboxes
  return (
    <>
      <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-quiet">
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-warning" aria-hidden="true" /> {t.legendWatch}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-danger/20" aria-hidden="true" /> {t.legendDanger}</span>
        <span>{t.legendWeekly}</span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {boxes.map((b) => {
          const data = b.weeks.map((w) => ({ week: weekLabel(w.week), rate: w.bounce.n > 0 ? w.bounce.rate : null, n: w.bounce.n }))
          const top = Math.max(0.06, ...data.map((d) => d.rate ?? 0)) * 1.15
          // A healthy period can hide a bad week: say it.
          const peak = b.weeks.filter((w) => w.bounce.n >= 20).reduce<(typeof b.weeks)[number] | null>((m, w) => (!m || w.bounce.rate > m.bounce.rate ? w : m), null)
          const status = b.status !== 'CONNECTED' ? ` · ${b.status === 'REVOKED' ? t.revoked : b.status.toLowerCase()}` : ''
          return (
            <div key={b.mailboxId} className="min-w-0 rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">{b.label}</p>
                  <p className="font-mono text-[11px] tabular-nums text-quiet">{b.bounce.n > 0 ? t.rate(p(b.bounce.rate), b.bounce.successes, b.bounce.n) : t.none}{status}</p>
                </div>
                <Badge tone={LEVEL_TONE[b.level]} className="shrink-0">{t.level[b.level]}</Badge>
              </div>
              <div className="mt-2 h-20 w-full" role="img" aria-label={t.chartLabel(b.label)}>
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                    <ReferenceArea y1={0.05} y2={top} fill="rgb(var(--c-danger))" fillOpacity={0.08} />
                    <ReferenceLine y={BOUNCE_WATCH} stroke="rgb(var(--c-warning))" strokeDasharray="3 3" strokeOpacity={0.7} />
                    <XAxis dataKey="week" hide />
                    <YAxis domain={[0, top]} hide />
                    <Tooltip
                      contentStyle={{ ...TIP, fontSize: 11 }}
                      labelStyle={TIP_LABEL}
                      itemStyle={TIP_ITEM}
                      formatter={(value, _n, item) => [t.tipValue(p(value as number), (item.payload as { n: number }).n), t.tipName]}
                    />
                    <Line dataKey="rate" stroke={SEND} strokeWidth={1.5} dot={data.length === 1 ? { r: 3 } : false} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {peak && peak.bounce.rate >= BOUNCE_WATCH && (
                <p className="mt-1 text-[11px] text-warning">{t.peak(p(peak.bounce.rate), weekLabel(peak.week), peak.bounce.successes, peak.bounce.n)}</p>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export function DelayChart({ curve }: { curve: DelayCurve }) {
  const t = analyticsCopy.delay
  const data = curve.points.map((pt) => ({ t: pt.t, replied: pt.replied, band: [pt.ci.low, pt.ci.high] }))
  const last = data.at(-1)?.t ?? 0
  if (last < 14 && data.length > 0) data.push({ ...data[data.length - 1], t: 14 })
  const top = Math.max(0.02, ...curve.points.map((pt) => pt.ci.high)) * 1.15
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" type="number" domain={[0, Math.max(14, last)]} ticks={[0, 3, 7, 14, 21, 30].filter((d) => d <= Math.max(14, last))} tickFormatter={(d: number) => t.day(d)} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis domain={[0, top]} tickFormatter={(v: number) => `${Math.round(v * 100)} %`} tick={AXIS} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            contentStyle={TIP}
            labelStyle={TIP_LABEL}
            itemStyle={TIP_ITEM}
            labelFormatter={(d) => t.day(Number(d))}
            formatter={(value, name) => (name === 'band' && Array.isArray(value) ? [`${p(value[0] as number)} à ${p(value[1] as number)}`, t.tipBand] : [p(value as number), t.tipReplied])}
          />
          {[3, 7, 14].map((d) => <ReferenceLine key={d} x={d} stroke="rgb(var(--c-muted) / 0.45)" strokeDasharray="3 3" />)}
          <Area type="stepAfter" dataKey="band" stroke="none" fill={REPLY} fillOpacity={0.15} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="replied" stroke={REPLY} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MixChart({ weeks }: { weeks: MixWeek[] }) {
  const t = analyticsCopy.mix
  const data = weeks.map((w) => ({
    // The number of leads under each week: a 100 % bar of 3 replies is not one of 30.
    week: `${weekLabel(w.week)} (${w.total})`,
    total: w.total,
    positive: w.total ? w.positive / w.total : 0,
    neutral: w.total ? w.neutral / w.total : 0,
    negative: w.total ? w.negative / w.total : 0,
  }))
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="week" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)} %`} tick={AXIS} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            contentStyle={TIP}
            labelStyle={TIP_LABEL}
            itemStyle={TIP_ITEM}
            cursor={{ fill: 'rgb(var(--c-white) / 0.04)' }}
            formatter={(value, name, item) => [t.tipValue(p(value as number), (item.payload as { total: number }).total), t.label[String(name)] ?? String(name)]}
          />
          <Bar dataKey="positive" stackId="m" fill={REPLY} isAnimationActive={false} />
          <Bar dataKey="neutral" stackId="m" fill="rgb(var(--c-muted))" fillOpacity={0.5} isAnimationActive={false} />
          <Bar dataKey="negative" stackId="m" fill="rgb(var(--c-danger))" fillOpacity={0.75} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
