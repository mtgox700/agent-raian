'use client'

/**
 * Lot A2, the panels drawn in plain markup (no chart library): score
 * calibration, the weekday × hour map, and the channels.
 */

import { Linkedin, Mail, MessageCircle, Smartphone } from 'lucide-react'
import type { Calibration, ChannelPoint, HeatGrid } from '@/lib/analytics/build'
import { ci, nf, pct } from './ChartFrame'

const BADGE_LABEL: Record<string, string> = { FAST_TRACK: 'Fast Track', NORMAL: 'Normal', NURTURE: 'Nurture', SKIP: 'Écarté', UNSCORED: 'Non scoré' }

export function CalibrationPanel({ data }: { data: Calibration }) {
  const max = Math.max(0.05, ...data.badges.map((b) => b.rate.ci.high)) * 1.1
  const x = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const t = data.topVsNormal
  return (
    <div>
      <ul className="space-y-3">
        {data.badges.map((b) => (
          <li key={b.badge} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
            <span className="text-xs font-semibold text-white">{BADGE_LABEL[b.badge] ?? b.badge}</span>
            <div className="relative h-5" role="img" aria-label={`${BADGE_LABEL[b.badge]} : ${pct(b.rate)}, intervalle ${ci(b.rate)}, ${nf(b.rate.n)} leads`}>
              <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-cyan/35" style={{ left: x(b.rate.ci.low), width: `calc(${x(b.rate.ci.high)} - ${x(b.rate.ci.low)})` }} />
              <div className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-void ${b.enough ? 'bg-cyan' : 'bg-transparent ring-1 ring-cyan'}`} style={{ left: x(b.rate.rate) }} />
            </div>
            <span className="text-[11px] tabular-nums text-muted"><span className="font-semibold text-white">{pct(b.rate)}</span> {nf(b.rate.successes)}/{nf(b.rate.n)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-white/85">
        {t === null
          ? 'Pas assez de leads Fast Track et Normal pour les comparer.'
          : t.delta > 0
            ? `Fast Track répond plus que Normal (+${(t.delta * 100).toFixed(1).replace('.', ',')} pt) : ${t.verdict === 'significatif' ? 'démontré' : 'à surveiller, non démontré (les deux groupes ne viennent pas des mêmes campagnes)'}.`
            : 'Fast Track ne répond pas plus que Normal sur la période : le score ne trie pas encore vos prospects.'}
      </p>
      {data.coverage.n > 0 && data.coverage.rate < 0.8 && (
        <p className="mt-1 text-xs text-warning">Seuls {pct(data.coverage)} des leads mesurés ont un score : la comparaison couvre mal la base.</p>
      )}
      <p className="mt-1 text-[11px] text-muted">Score produit par IA. Un point creux signale moins de 30 leads.</p>
    </div>
  )
}

/** Below this, a weekday × hour grid shows noise, not habits. */
const HEAT_MIN = 100

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/** Sends in cyan (the machine), replies in gold (a human). */
type Tone = '--c-cyan' | '--c-gold'

function Cell({ v, max, label, tone }: { v: number; max: number; label: string; tone: Tone }) {
  const a = max > 0 ? v / max : 0
  return <div title={label} aria-label={label} className="h-5 rounded-[3px]" style={{ background: v > 0 ? `rgb(var(${tone}) / ${0.12 + a * 0.88})` : 'rgb(var(--c-white) / 0.03)' }} />
}

/** Sends and replies on the same grid: when Phantera sent, and when prospects answered. */
export function HeatmapPanel({ grid }: { grid: HeatGrid }) {
  // 4-hour blocks on a phone (6 columns), hours on a wide screen (24).
  const blocks = (g: number[][]) => g.map((row) => Array.from({ length: 6 }, (_, i) => row.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b, 0)))
  const layer = (title: string, g: number[][], total: number, unit: string, tone: Tone) => {
    const coarse = blocks(g)
    const max = Math.max(0, ...g.flat())
    const maxCoarse = Math.max(0, ...coarse.flat())
    return (
      <div>
        <p className="mb-2 text-xs font-semibold text-white">{title} <span className="font-normal text-muted">({nf(total)} {unit})</span></p>
        {total > 0 && total < HEAT_MIN && (
          <p className="mb-2 text-[11px] text-warning">Trop peu pour lire un créneau : {nf(total)} {unit} répartis sur 168 heures de la semaine, chaque case en compte une poignée.</p>
        )}
        <div className="hidden sm:grid" style={{ gridTemplateColumns: '2.25rem repeat(24, minmax(0, 1fr))', gap: 2 }}>
          <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center font-mono text-[11px] text-muted">{h % 3 === 0 ? `${h}h` : ''}</span>)}
          {g.map((row, d) => [<span key={`d${d}`} className="text-[11px] leading-5 text-muted">{DAYS[d]}</span>, ...row.map((v, h) => <Cell key={`${d}-${h}`} v={v} max={max} tone={tone} label={`${DAYS[d]} ${h}h : ${v} ${unit}`} />)])}
        </div>
        <div className="grid sm:hidden" style={{ gridTemplateColumns: '2.25rem repeat(6, minmax(0, 1fr))', gap: 3 }}>
          <span />{['0-4h', '4-8h', '8-12h', '12-16h', '16-20h', '20-24h'].map((h) => <span key={h} className="text-center font-mono text-[11px] text-muted">{h}</span>)}
          {coarse.map((row, d) => [<span key={`m${d}`} className="text-[11px] leading-5 text-muted">{DAYS[d]}</span>, ...row.map((v, i) => <Cell key={`m${d}-${i}`} v={v} max={maxCoarse} tone={tone} label={`${DAYS[d]} ${i * 4}h-${i * 4 + 4}h : ${v} ${unit}`} />)])}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {layer('Envois', grid.sent, grid.totalSent, 'messages', '--c-cyan')}
      {layer('Réponses', grid.replied, grid.totalReplied, 'leads', '--c-gold')}
      <p className="text-[11px] text-muted">Heure de Paris, celle de l’expéditeur : le fuseau des prospects n’est pas connu. Les envois suivent votre calendrier, ce n’est pas une expérience : un créneau qui reçoit plus de réponses ne prouve pas qu’il convainc mieux.</p>
    </div>
  )
}

const CHANNEL: Record<string, { label: string; Icon: typeof Mail }> = {
  EMAIL: { label: 'E-mail', Icon: Mail },
  LINKEDIN: { label: 'LinkedIn', Icon: Linkedin },
  SMS: { label: 'SMS', Icon: Smartphone },
  WHATSAPP: { label: 'WhatsApp', Icon: MessageCircle },
}

export function ChannelsPanel({ channels }: { channels: ChannelPoint[] }) {
  return (
    <div>
      <ul className="divide-y divide-border/40">
        {channels.map((c) => {
          const ch = CHANNEL[c.channel] ?? { label: c.channel, Icon: MessageCircle }
          return (
            <li key={c.channel} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-white"><ch.Icon className="h-4 w-4 text-muted" aria-hidden="true" /> {ch.label}</span>
              <span className="text-xs tabular-nums text-muted">
                {nf(c.reached)} leads touchés · {c.rate ? <><span className="font-semibold text-white">{pct(c.rate)}</span> ont répondu (IC {ci(c.rate)})</> : <span className="text-muted">{c.note}</span>}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted">Une réponse est attribuée au canal du message auquel le prospect a répondu. Les canaux s’enchaînent dans une séquence : ce n’est pas une comparaison tirée au sort.</p>
    </div>
  )
}
