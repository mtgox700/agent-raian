'use client'

/**
 * The Recharts charts of the analytics page, in one module loaded on demand
 * (next/dynamic in AnalyticsDashboard): the library stays out of the
 * page's first load. Colours come from the theme variables: gold for
 * replies (a human), cyan for sends and bounces (the machine), neutrals for
 * grids and campaign events.
 */

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CohortPoint, DelayCurve, MailboxHealth, MixWeek } from '@/lib/analytics/build'
import type { AnnotatedWeek } from '@/lib/analytics/annotations'
import { BOUNCE_WATCH } from '@/lib/analytics/filters'
import { formatPercent } from '@/lib/format/percent'

const AXIS = { fontSize: 10, fill: 'rgb(var(--c-muted))', fontFamily: 'var(--font-mono, monospace)' }
const GRID = 'rgb(var(--c-border))'
const TIP = { background: 'rgb(var(--c-obsidian))', border: '1px solid rgb(var(--c-border))', borderRadius: 6, fontSize: 12 }
const REPLY = 'rgb(var(--c-gold))'
const SEND = 'rgb(var(--c-cyan))'
const EVENT = 'rgb(var(--c-white) / 0.55)'
const weekLabel = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const p = (v: number) => formatPercent(v * 100)

export function CohortChart({ points, annotations = [] }: { points: CohortPoint[]; annotations?: AnnotatedWeek[] }) {
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
  // The axis holds the whole band: it used to follow the line and clip the interval.
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
            formatter={(value, name, item) => {
              const d = item.payload as (typeof data)[number]
              if (name === 'band' && Array.isArray(value)) return [`${p(value[0] as number)} à ${p(value[1] as number)}`, 'IC 95 %']
              return [`${p(value as number)} (${d.n} leads mesurés${d.provisional ? ', semaine pas encore complète' : ''})`, 'Réponse à J+7']
            }}
          />
          <Area dataKey="band" stroke="none" fill={REPLY} fillOpacity={0.15} isAnimationActive={false} />
          {marks.map((a) => (
            <ReferenceLine key={a.week} x={weekLabel(a.week)} stroke={EVENT} strokeDasharray="3 3"
              label={{ value: String(a.events.length), position: 'top', fill: EVENT, fontSize: 10 }} />
          ))}
          <Line dataKey="rate" stroke={REPLY} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

const LEVEL: Record<MailboxHealth['level'], { label: string; tone: string }> = {
  ok: { label: 'sain', tone: 'text-success-fg border-success-fg/40' },
  vigilance: { label: 'vigilance', tone: 'text-warning border-warning/40' },
  danger: { label: 'danger', tone: 'text-danger border-danger/40' },
  insuffisant: { label: 'pas assez d’envois', tone: 'text-muted border-border' },
}

export function MailboxCards({ boxes }: { boxes: MailboxHealth[] }) {
  return (
    <>
    <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
      <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-warning" aria-hidden="true" /> vigilance à 2 %</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-danger/20" aria-hidden="true" /> danger à partir de 5 %</span>
      <span>une courbe par semaine d’envoi</span>
    </p>
    <div className="grid gap-3 md:grid-cols-2">
      {boxes.map((b) => {
        const data = b.weeks.map((w) => ({ week: weekLabel(w.week), rate: w.bounce.n > 0 ? w.bounce.rate : null, n: w.bounce.n }))
        const top = Math.max(0.06, ...data.map((d) => d.rate ?? 0)) * 1.15
        // A healthy period can hide a bad week: say it.
        const peak = b.weeks.filter((w) => w.bounce.n >= 20).reduce<(typeof b.weeks)[number] | null>((m, w) => (!m || w.bounce.rate > m.bounce.rate ? w : m), null)
        return (
          <div key={b.mailboxId} className="rounded-[10px] border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{b.label}</p>
                <p className="font-mono text-[11px] tabular-nums text-muted">{b.bounce.n > 0 ? `${p(b.bounce.rate)} de rebonds · ${b.bounce.successes}/${b.bounce.n}` : 'aucun envoi sur la période'}{b.status !== 'CONNECTED' ? ` · ${b.status === 'REVOKED' ? 'déconnectée' : b.status.toLowerCase()}` : ''}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${LEVEL[b.level].tone}`}>{LEVEL[b.level].label}</span>
            </div>
            <div className="mt-2 h-20 w-full" role="img" aria-label={`Rebonds de ${b.label} par semaine`}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <ReferenceArea y1={0.05} y2={top} fill="rgb(var(--c-danger))" fillOpacity={0.08} />
                  <ReferenceLine y={BOUNCE_WATCH} stroke="rgb(var(--c-warning))" strokeDasharray="3 3" strokeOpacity={0.7} />
                  <XAxis dataKey="week" hide />
                  <YAxis domain={[0, top]} hide />
                  <Tooltip
                    contentStyle={{ ...TIP, fontSize: 11 }}
                    formatter={(value, _n, item) => [`${p(value as number)} (${(item.payload as { n: number }).n} envois)`, 'Rebonds']}
                  />
                  <Line dataKey="rate" stroke={SEND} strokeWidth={1.5} dot={data.length === 1 ? { r: 3 } : false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {peak && peak.bounce.rate >= BOUNCE_WATCH && (
              <p className="mt-1 text-[11px] text-warning">Pic à {p(peak.bounce.rate)} la semaine du {weekLabel(peak.week)} ({peak.bounce.successes} rebonds sur {peak.bounce.n})</p>
            )}
          </div>
        )
      })}
    </div>
    </>
  )
}

export function DelayChart({ curve }: { curve: DelayCurve }) {
  const data = curve.points.map((p) => ({ t: p.t, replied: p.replied, band: [p.ci.low, p.ci.high] }))
  const last = data.at(-1)?.t ?? 0
  if (last < 14) data.push({ ...data.at(-1)!, t: 14 })
  const top = Math.max(0.02, ...curve.points.map((p) => p.ci.high)) * 1.15
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" type="number" domain={[0, Math.max(14, last)]} ticks={[0, 3, 7, 14, 21, 30].filter((t) => t <= Math.max(14, last))} tickFormatter={(t: number) => `J+${t}`} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis domain={[0, top]} tickFormatter={(v: number) => `${Math.round(v * 100)} %`} tick={AXIS} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            contentStyle={TIP}
            labelFormatter={(t) => `J+${t}`}
            formatter={(value, name) => (name === 'band' && Array.isArray(value) ? [`${p(value[0] as number)} à ${p(value[1] as number)}`, 'IC 95 %'] : [p(value as number), 'Ont répondu'])}
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
  const data = weeks.map((w) => ({
    // The number of leads under each week: a 100 % bar of 3 replies is not one of 30.
    week: `${weekLabel(w.week)} (${w.total})`, total: w.total,
    positive: w.total ? w.positive / w.total : 0, neutral: w.total ? w.neutral / w.total : 0, negative: w.total ? w.negative / w.total : 0,
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
            formatter={(value, name, item) => [`${p(value as number)} de ${(item.payload as { total: number }).total} leads`, MIX_LABEL[String(name)] ?? String(name)]}
          />
          <Bar dataKey="positive" stackId="m" fill={REPLY} isAnimationActive={false} />
          <Bar dataKey="neutral" stackId="m" fill="rgb(var(--c-muted))" fillOpacity={0.5} isAnimationActive={false} />
          <Bar dataKey="negative" stackId="m" fill="rgb(var(--c-danger))" fillOpacity={0.75} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const MIX_LABEL: Record<string, string> = { positive: 'Positives', neutral: 'Neutres', negative: 'Refus' }
