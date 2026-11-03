'use client'

/**
 * StepComparisonTable
 *
 * Displays per-step analytics for an email sequence campaign.
 * Shows sent count, open / click / reply rates with inline bars.
 * Marks the best-performing step per metric.
 */

import { useState } from 'react'
import {
  Mail, Eye, MousePointer2, MessageSquare, AlertCircle, Pencil, ChevronRight, Linkedin, MessageCircle, Smartphone,
} from 'lucide-react'
import type { StepStats } from '@/lib/services/campaign-stats.service'
import { StepDetailDrawer } from '@/components/dashboard/StepDetailDrawer'
import { cn } from '@/lib/utils'

// ─── Sub-components ───────────────────────────────────────────────────────────

type RateTone = 'signal' | 'success' | 'human'

const RATE_TONE: Record<RateTone, { text: string; bar: string }> = {
  signal:  { text: 'text-cyan',       bar: 'bg-cyan' },
  success: { text: 'text-success-fg', bar: 'bg-success-fg' },
  human:   { text: 'text-gold',       bar: 'bg-gold' },
}

interface RateBarProps {
  value: number   // percentage 0-100
  tone: RateTone
  isBest: boolean
}

function RateBar({ value, tone, isBest }: RateBarProps) {
  const t = RATE_TONE[tone]
  return (
    <div className="ml-auto min-w-[88px] max-w-[120px]">
      <div className="mb-1 flex items-center justify-end gap-2">
        {isBest && <span className={cn('font-mono text-[11px]', t.text)}>meilleure</span>}
        <span className={cn('font-mono text-xs font-semibold tabular-nums', isBest ? t.text : 'text-white')}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-px bg-border" aria-hidden="true">
        <div
          className={cn('h-px', t.bar, !isBest && 'opacity-60')}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

function Empty({ children = '-' }: { children?: string }) {
  return <span className="font-mono text-xs text-muted">{children}</span>
}

function NotMeasured() {
  return <span className="font-mono text-xs text-muted" title="Non mesurable hors e-mail">n.d.</span>
}

function ChannelIcon({ channel }: { channel: StepStats['channel'] }) {
  const cls = 'h-3 w-3 flex-shrink-0 text-muted'
  if (channel === 'LINKEDIN') return <Linkedin className={cls} aria-hidden="true" />
  if (channel === 'WHATSAPP') return <MessageCircle className={cls} aria-hidden="true" />
  if (channel === 'SMS') return <Smartphone className={cls} aria-hidden="true" />
  return <Mail className={cls} aria-hidden="true" />
}

function channelLabel(channel: StepStats['channel']): string {
  if (channel === 'LINKEDIN') return 'Message LinkedIn'
  return `${channel === 'SMS' ? 'SMS' : 'WhatsApp'} · depuis votre téléphone`
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-border py-10">
      <Mail className="h-5 w-5 text-muted" aria-hidden="true" />
      <p className="text-sm text-muted">
        Lancez la campagne pour voir les statistiques par étape
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface StepComparisonTableProps {
  steps: StepStats[]
}

const TH = 'px-4 py-3 font-mono text-xs font-normal text-muted'

function HeadCell({ icon: Icon, label, align = 'right' }: { icon: typeof Mail; label: string; align?: 'left' | 'right' }) {
  return (
    <th scope="col" className={cn(TH, align === 'right' ? 'text-right' : 'text-left')}>
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
    </th>
  )
}

export function StepComparisonTable({ steps }: StepComparisonTableProps) {
  const [selected, setSelected] = useState<StepStats | null>(null)

  if (steps.length === 0) return <EmptyState />

  // Find best values per metric for highlighting
  const bestOpenRate  = Math.max(...steps.map((s) => s.openRate))
  const bestClickRate = Math.max(...steps.map((s) => s.clickRate))
  const bestReplyRate = Math.max(...steps.map((s) => s.replyRate))

  const hasAnyData = steps.some((s) => s.totalSent > 0)

  return (
    <>
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={cn(TH, 'text-left')}>Étape</th>
            <th scope="col" className={cn(TH, 'text-left')}>Objet ou message</th>
            <HeadCell icon={Mail} label="Envoyés" />
            <HeadCell icon={Eye} label="Ouverture" />
            <HeadCell icon={MousePointer2} label="Clics" />
            <HeadCell icon={MessageSquare} label="Réponses" />
            <HeadCell icon={AlertCircle} label="Échecs" />
            <th scope="col" className="px-3 py-3" aria-label="Voir l'email" />
          </tr>
        </thead>

        <tbody className="divide-y divide-border bg-obsidian">
          {steps.map((step) => {
            const isBestOpen  = step.openRate  === bestOpenRate  && bestOpenRate  > 0
            const isBestClick = step.clickRate === bestClickRate && bestClickRate > 0
            const isBestReply = step.replyRate === bestReplyRate && bestReplyRate > 0
            const isEmail = step.channel === 'EMAIL'

            return (
              <tr
                key={step.stepId}
                onClick={() => setSelected(step)}
                className="group cursor-pointer transition-colors duration-150 ease-signal hover:bg-white/[0.03]"
              >
                {/* Step number + day offset */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-sm font-semibold tabular-nums text-white">{step.position + 1}</span>
                    <ChannelIcon channel={step.channel} />
                    <span className="text-xs tabular-nums text-muted">J+{step.dayOffset}</span>
                  </div>
                </td>

                {/* Subject (email) or message preview (no subject line) */}
                <td className="max-w-[220px] px-4 py-4">
                  {!isEmail ? (
                    <div className="min-w-0">
                      <span className="mb-1 block font-mono text-[11px] text-muted">{channelLabel(step.channel)}</span>
                      <p className="truncate text-xs text-white/70" title={step.body}>
                        {step.body.replace(/\s+/g, ' ').slice(0, 70)}…
                      </p>
                    </div>
                  ) : (
                    <p className="truncate text-xs font-medium text-white/80" title={step.subject}>
                      {step.subject}
                    </p>
                  )}
                </td>

                {/* Sent count */}
                <td className="px-4 py-4 text-right">
                  {hasAnyData ? (
                    <span className="font-mono text-sm font-semibold tabular-nums text-white">
                      {step.totalSent.toLocaleString('fr-FR')}
                    </span>
                  ) : <Empty />}
                </td>

                {/* Open rate: not measurable outside email (no pixel) */}
                <td className="px-4 py-4 text-right">
                  {!isEmail ? <NotMeasured />
                    : step.totalSent > 0 ? <RateBar value={step.openRate} tone="signal" isBest={isBestOpen} />
                    : <Empty />}
                </td>

                {/* Click rate: idem */}
                <td className="px-4 py-4 text-right">
                  {!isEmail ? <NotMeasured />
                    : step.totalSent > 0 ? <RateBar value={step.clickRate} tone="success" isBest={isBestClick} />
                    : <Empty />}
                </td>

                {/* Reply rate */}
                <td className="px-4 py-4 text-right">
                  {step.totalSent > 0 ? (
                    <div>
                      <RateBar value={step.replyRate} tone="human" isBest={isBestReply} />
                      <p className="mt-1 font-mono text-[11px] tabular-nums text-muted">
                        {step.replyCount} réponse{step.replyCount > 1 ? 's' : ''}
                      </p>
                    </div>
                  ) : <Empty />}
                </td>

                {/* Failed */}
                <td className="px-4 py-4 text-right">
                  <span className={cn('font-mono text-xs tabular-nums', step.failed > 0 ? 'font-semibold text-danger' : 'text-muted')}>
                    {step.failed}
                  </span>
                </td>

                {/* Open / edit affordance: a real button for keyboard users */}
                <td className="px-3 py-4 text-right">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelected(step) }}
                    aria-label={`${step.totalSent > 0 ? 'Voir' : 'Modifier'} l'étape ${step.position + 1}`}
                    className="inline-flex h-8 items-center gap-0.5 rounded-md px-1 text-muted transition-colors duration-150 ease-signal group-hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                  >
                    {step.totalSent > 0
                      ? <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      : <Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>

    <StepDetailDrawer step={selected} onClose={() => setSelected(null)} />
    </>
  )
}
