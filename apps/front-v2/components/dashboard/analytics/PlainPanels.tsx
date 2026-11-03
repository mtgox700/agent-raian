/**
 * The panels drawn in plain markup (no chart library): score calibration,
 * the weekday × hour map, and the channels. Server-safe.
 */

import { Linkedin, Mail, MessageCircle, Smartphone } from 'lucide-react'
import { analyticsCopy } from '@/lib/copy/analytics'
import type { Calibration, ChannelPoint, HeatGrid } from '@/lib/front/types-analytics'
import { ci, nf, pct, pointsValue } from './format'
import { IntervalBar } from './IntervalBar'

export function CalibrationPanel({ data }: { data: Calibration }) {
  const t = analyticsCopy.calibration
  const max = Math.max(0.05, ...data.badges.map((b) => b.rate.ci.high)) * 1.1
  const vs = data.topVsNormal
  return (
    <div>
      <ul className="space-y-3">
        {data.badges.map((b) => {
          const name = t.badge[b.badge] ?? b.badge
          return (
            <li key={b.badge} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
              <span className="text-xs font-medium text-ink">{name}</span>
              <IntervalBar rate={b.rate} max={max} hollow={!b.enough} className="h-5" label={t.pointLabel(name, pct(b.rate), ci(b.rate), nf(b.rate.n))} />
              <span className="font-mono text-[11px] tabular-nums text-quiet"><span className="font-semibold text-ink">{pct(b.rate)}</span> {nf(b.rate.successes)}/{nf(b.rate.n)}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-ink/85">
        {vs === null ? t.noCompare : vs.delta > 0 ? t.better(pointsValue(vs.delta), vs.verdict === 'significatif') : t.notBetter}
      </p>
      {data.coverage.n > 0 && data.coverage.rate < 0.8 && <p className="mt-1 text-xs text-warning">{t.coverage(pct(data.coverage))}</p>}
      <p className="mt-1 text-[11px] text-quiet">{t.note}</p>
    </div>
  )
}

/** Below this, a weekday × hour grid shows noise, not habits. */
const HEAT_MIN = 100

/** Sends in accent (the machine), replies in signal (a person). */
type Tone = '--c-cyan' | '--c-gold'

function Cell({ v, max, label, tone }: { v: number; max: number; label: string; tone: Tone }) {
  const a = max > 0 ? v / max : 0
  return <div title={label} aria-label={label} className="h-5 rounded-[3px]" style={{ background: v > 0 ? `rgb(var(${tone}) / ${0.12 + a * 0.88})` : 'rgb(var(--c-white) / 0.03)' }} />
}

/** Sends and replies on the same grid: when Phantera sent, and when prospects answered. */
export function HeatmapPanel({ grid }: { grid: HeatGrid }) {
  const t = analyticsCopy.heatmap
  // 4-hour blocks on a phone (6 columns), hours on a wide screen (24).
  const blocks = (g: number[][]) => g.map((row) => Array.from({ length: 6 }, (_, i) => row.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b, 0)))
  const layer = (title: string, g: number[][], total: number, unit: string, tone: Tone) => {
    const coarse = blocks(g)
    const max = Math.max(0, ...g.flat())
    const maxCoarse = Math.max(0, ...coarse.flat())
    return (
      <div>
        <p className="mb-2 text-xs font-medium text-ink">{title} <span className="font-normal text-quiet">({nf(total)} {unit})</span></p>
        {total > 0 && total < HEAT_MIN && <p className="mb-2 text-[11px] text-warning">{t.few(nf(total), unit)}</p>}
        <div className="hidden sm:grid" style={{ gridTemplateColumns: '2.25rem repeat(24, minmax(0, 1fr))', gap: 2 }}>
          <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center font-mono text-[11px] text-quiet">{h % 3 === 0 ? `${h}h` : ''}</span>)}
          {g.map((row, d) => [<span key={`d${d}`} className="text-[11px] leading-5 text-quiet">{t.days[d]}</span>, ...row.map((v, h) => <Cell key={`${d}-${h}`} v={v} max={max} tone={tone} label={`${t.days[d]} ${h}h : ${v} ${unit}`} />)])}
        </div>
        <div className="grid sm:hidden" style={{ gridTemplateColumns: '2.25rem repeat(6, minmax(0, 1fr))', gap: 3 }}>
          <span />{t.blocks.map((h) => <span key={h} className="text-center font-mono text-[11px] text-quiet">{h}</span>)}
          {coarse.map((row, d) => [<span key={`m${d}`} className="text-[11px] leading-5 text-quiet">{t.days[d]}</span>, ...row.map((v, i) => <Cell key={`m${d}-${i}`} v={v} max={maxCoarse} tone={tone} label={`${t.days[d]} ${i * 4}h-${i * 4 + 4}h : ${v} ${unit}`} />)])}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {layer(t.sent, grid.sent, grid.totalSent, t.sentUnit, '--c-cyan')}
      {layer(t.replied, grid.replied, grid.totalReplied, t.repliedUnit, '--c-gold')}
      <p className="text-[11px] text-quiet">{t.note}</p>
    </div>
  )
}

const CHANNEL_ICON: Record<string, typeof Mail> = { EMAIL: Mail, LINKEDIN: Linkedin, SMS: Smartphone, WHATSAPP: MessageCircle }

export function ChannelsPanel({ channels }: { channels: ChannelPoint[] }) {
  const t = analyticsCopy.channels
  return (
    <div>
      <ul className="divide-y divide-line">
        {channels.map((c) => {
          const Icon = CHANNEL_ICON[c.channel] ?? MessageCircle
          return (
            <li key={c.channel} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium text-ink"><Icon className="h-4 w-4 text-quiet" aria-hidden="true" /> {t.label[c.channel] ?? c.channel}</span>
              <span className="font-mono text-[11px] tabular-nums text-quiet">
                {t.reached(nf(c.reached))}{c.rate ? <><span className="font-semibold text-ink">{pct(c.rate)}</span>{t.replied(ci(c.rate))}</> : c.note}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[11px] text-quiet">{t.note}</p>
    </div>
  )
}
