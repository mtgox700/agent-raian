'use client'

/**
 * CampaignCard: sober campaign summary card (Instrument direction).
 *
 *  - Status through the shared StatusBadge (one tone map for the dashboard).
 *  - Actions live in a FIXED footer (passed by the parent via `actions`),
 *    never in a hover overlay floating above the stats.
 *  - Channel-aware: LinkedIn vs E-mail next to the status.
 *  - The only motion is the progress bar filling: it carries the figure.
 */

import { formatPercent } from '@/lib/format/percent'
import Link from 'next/link'
import { Mail, Linkedin, Sparkles, BarChart2 } from 'lucide-react'
import { StatusBadge, CAMPAIGN_STATUS } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import type { Campaign } from '@/lib/types/dashboard'

interface CampaignCardProps {
  campaign: Campaign
  /** Position in a list; kept for callers, no longer drives a staggered delay. */
  index?: number
  /** Action buttons rendered in the card footer (above the overlay link). */
  actions?: React.ReactNode
}

function Stat({ label, value, accent, hint }: { label: string; value: string; accent?: boolean; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <p className={cn('font-mono text-sm font-semibold tabular-nums', accent ? 'text-gold' : 'text-white')}>
        {value}
      </p>
      <p className="mt-0.5 font-mono text-xs text-muted">{label}</p>
      {hint && <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-muted">{hint}</p>}
    </div>
  )
}

export function CampaignCard({ campaign, actions }: CampaignCardProps) {
  const status = CAMPAIGN_STATUS[campaign.status] ?? { tone: 'neutral' as const, label: campaign.status }
  const isLinkedIn = campaign.firstStepChannel === 'LINKEDIN'
  // Progress = distinct leads contacted / total leads (coherent, always <= 100%).
  const progress = campaign.targetCount > 0
    ? Math.min(100, (campaign.contactedCount / campaign.targetCount) * 100)
    : 0

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[10px] border border-border bg-obsidian',
        'transition-colors duration-200 ease-signal hover:border-white/20',
      )}
    >
      {/* Invisible overlay link: the card body navigates to the detail page */}
      <Link
        href={`/dashboard/campaigns/${campaign.id}`}
        className="absolute inset-0 z-[1] rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
        aria-label={`Voir la campagne ${campaign.name}`}
      />

      {/* ── Body ── */}
      <div className="flex-1 p-5 pb-4">
        {/* Top row: status + channel + AI */}
        <div className="mb-3 flex items-center gap-2">
          <StatusBadge tone={status.tone} live={campaign.status === 'active'}>{status.label}</StatusBadge>
          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted">
            {isLinkedIn ? <Linkedin className="h-3 w-3" aria-hidden="true" /> : <Mail className="h-3 w-3" aria-hidden="true" />}
            {isLinkedIn ? 'LinkedIn' : 'E-mail'}
          </span>
          {campaign.aiPersonalization && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Personnalisée
            </span>
          )}
        </div>

        {/* Title + industry */}
        <h4 className="text-[15px] font-semibold leading-snug text-white">{campaign.name}</h4>
        {campaign.industry && (
          <p className="mt-0.5 text-xs text-muted">{campaign.industry}</p>
        )}

        {/* Progress */}
        {campaign.status !== 'draft' ? (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="font-mono text-xs tabular-nums text-muted">
                <span className="text-white">{campaign.contactedCount.toLocaleString('fr-FR')}</span>
                {' '}/ {campaign.targetCount.toLocaleString('fr-FR')} leads contactés
              </span>
              <span className="font-mono text-xs tabular-nums text-white">{progress.toFixed(0)} %</span>
            </div>
            <div
              className="h-0.5 overflow-hidden rounded-full bg-white/[0.06]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label="Leads contactés"
            >
              {/* Grows once from the left on mount (transform only, globals.css .ui-grow-x). */}
              <div className="ui-grow-x h-full rounded-full bg-cyan" style={{ width: `${progress}%` }} />
            </div>

            {/* Stats row: quiet, divider-separated */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-border">
              {/* Opens exist for emails only, and are indicative (pixel tracking). */}
              <div className="pr-3"><Stat label="Ouverture"  value={(campaign.emailSentCount ?? 0) > 0 ? formatPercent(campaign.openRate) : '-'} hint={(campaign.emailSentCount ?? 0) > 0 ? 'indicative' : undefined} /></div>
              <div className="px-3"><Stat label="Réponse"    value={campaign.contactedCount > 0 ? formatPercent(campaign.replyRate) : '-'} accent hint={campaign.repliedCount !== undefined && campaign.contactedCount > 0 ? `${campaign.repliedCount} / ${campaign.contactedCount} leads` : undefined} /></div>
              <div className="pl-3"><Stat label="Conversion" value={formatPercent(campaign.conversionRate)} /></div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5">
            <BarChart2 className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
            <span className="text-xs text-muted">Lancez la campagne pour voir les statistiques</span>
          </div>
        )}
      </div>

      {/* ── Footer actions: fixed, above the overlay link ── */}
      {actions && (
        <div className="relative z-[2] flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          {actions}
        </div>
      )}
    </div>
  )
}
