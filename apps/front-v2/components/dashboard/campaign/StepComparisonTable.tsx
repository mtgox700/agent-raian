'use client'

/**
 * Per-step analytics: sent, open / click / reply rates with a hairline bar,
 * the best step per metric marked. A row opens the step (StepDetailDrawer).
 */
import { useState } from 'react'
import { AlertCircle, ChevronRight, Eye, Linkedin, Mail, MessageCircle, MessageSquare, MousePointer2, Pencil, Smartphone } from 'lucide-react'
import { StepDetailDrawer } from '@/components/dashboard/campaign/StepDetailDrawer'
import { stepsCopy as t } from '@/lib/copy/campaign'
import type { CampaignStepStats } from '@/lib/front/types-campaigns'
import { cn } from '@/lib/utils'

type RateTone = 'machine' | 'success' | 'human'
const RATE_TONE: Record<RateTone, { text: string; bar: string }> = {
  machine: { text: 'text-accent', bar: 'bg-accent' },
  success: { text: 'text-success', bar: 'bg-success' },
  human: { text: 'text-signal', bar: 'bg-signal' },
}

function RateBar({ value, tone, isBest }: { value: number; tone: RateTone; isBest: boolean }) {
  const c = RATE_TONE[tone]
  return (
    <div className="ml-auto min-w-[88px] max-w-[120px]">
      <div className="mb-1 flex items-center justify-end gap-2">
        {isBest && <span className={cn('font-mono text-[11px]', c.text)}>{t.best}</span>}
        <span className={cn('font-mono text-xs font-semibold tabular-nums', isBest ? c.text : 'text-ink')}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-px bg-line" aria-hidden="true">
        <div className={cn('h-px', c.bar, !isBest && 'opacity-60')} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

const Empty = () => <span className="font-mono text-xs text-quiet">-</span>
const NotMeasured = () => <span className="font-mono text-xs text-quiet" title={t.notMeasuredTitle}>{t.notMeasured}</span>

function ChannelIcon({ channel }: { channel: CampaignStepStats['channel'] }) {
  const cls = 'h-3 w-3 shrink-0 text-quiet'
  if (channel === 'LINKEDIN') return <Linkedin className={cls} aria-hidden="true" />
  if (channel === 'WHATSAPP') return <MessageCircle className={cls} aria-hidden="true" />
  if (channel === 'SMS') return <Smartphone className={cls} aria-hidden="true" />
  return <Mail className={cls} aria-hidden="true" />
}

const channelLabel = (channel: CampaignStepStats['channel']) =>
  channel === 'LINKEDIN' ? t.linkedinMessage : t.phoneChannel(channel === 'SMS' ? 'SMS' : 'WhatsApp')

const TH = 'h-10 whitespace-nowrap px-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-quiet'

function HeadCell({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <th scope="col" className={cn(TH, 'text-right')}>
      <span className="inline-flex items-center justify-end gap-1"><Icon className="h-3 w-3" aria-hidden="true" />{label}</span>
    </th>
  )
}

export function StepComparisonTable({ steps }: { steps: CampaignStepStats[] }) {
  const [selected, setSelected] = useState<CampaignStepStats | null>(null)

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-10">
        <Mail className="h-5 w-5 text-quiet" aria-hidden="true" />
        <p className="text-sm text-quiet">{t.empty}</p>
      </div>
    )
  }

  const bestOpen = Math.max(...steps.map((s) => s.openRate))
  const bestClick = Math.max(...steps.map((s) => s.clickRate))
  const bestReply = Math.max(...steps.map((s) => s.replyRate))
  const hasAnyData = steps.some((s) => s.totalSent > 0)

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">{t.caption}</caption>
          <thead className="border-b border-line">
            <tr>
              <th scope="col" className={TH}>{t.step}</th>
              <th scope="col" className={TH}>{t.subject}</th>
              <HeadCell icon={Mail} label={t.sent} />
              <HeadCell icon={Eye} label={t.open} />
              <HeadCell icon={MousePointer2} label={t.clicks} />
              <HeadCell icon={MessageSquare} label={t.replies} />
              <HeadCell icon={AlertCircle} label={t.failures} />
              <th scope="col" className="px-3" aria-label={t.viewEmail} />
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-raised">
            {steps.map((step) => {
              const isEmail = step.channel === 'EMAIL'
              return (
                <tr key={step.stepId} onClick={() => setSelected(step)} className="group cursor-pointer transition-colors duration-200 ease-signal hover:bg-surface/50">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-sm font-semibold tabular-nums text-ink">{step.position + 1}</span>
                      <ChannelIcon channel={step.channel} />
                      <span className="text-xs tabular-nums text-quiet">J+{step.dayOffset}</span>
                    </div>
                  </td>
                  <td className="max-w-[220px] px-4 py-4">
                    {!isEmail ? (
                      <div className="min-w-0">
                        <span className="mb-1 block font-mono text-[11px] text-quiet">{channelLabel(step.channel)}</span>
                        <p className="truncate text-xs text-ink/70" title={step.body}>{step.body.replace(/\s+/g, ' ').slice(0, 70)}…</p>
                      </div>
                    ) : (
                      <p className="truncate text-xs font-medium text-ink/80" title={step.subject}>{step.subject}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {hasAnyData ? <span className="font-mono text-sm font-semibold tabular-nums text-ink">{step.totalSent.toLocaleString('fr-FR')}</span> : <Empty />}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {!isEmail ? <NotMeasured /> : step.totalSent > 0 ? <RateBar value={step.openRate} tone="machine" isBest={step.openRate === bestOpen && bestOpen > 0} /> : <Empty />}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {!isEmail ? <NotMeasured /> : step.totalSent > 0 ? <RateBar value={step.clickRate} tone="success" isBest={step.clickRate === bestClick && bestClick > 0} /> : <Empty />}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {step.totalSent > 0 ? (
                      <div>
                        <RateBar value={step.replyRate} tone="human" isBest={step.replyRate === bestReply && bestReply > 0} />
                        <p className="mt-1 font-mono text-[11px] tabular-nums text-quiet">{t.replyCount(step.replyCount)}</p>
                      </div>
                    ) : <Empty />}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={cn('font-mono text-xs tabular-nums', step.failed > 0 ? 'font-semibold text-danger' : 'text-quiet')}>{step.failed}</span>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelected(step) }}
                      aria-label={t.openStep(step.totalSent > 0, step.position + 1)}
                      className="inline-flex h-8 items-center gap-0.5 rounded-md px-1 text-quiet transition-colors duration-200 ease-signal group-hover:text-accent"
                    >
                      {step.totalSent > 0 ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
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
