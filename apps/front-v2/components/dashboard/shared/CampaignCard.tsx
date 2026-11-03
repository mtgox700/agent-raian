import Link from 'next/link'
import { BarChart2, Linkedin, Mail, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui'
import { campaignCard as t } from '@/lib/app-copy'
import { formatPercent } from '@/lib/format/percent'
import type { DashboardCampaign } from '@/lib/front/types'
import { cn } from '@/lib/utils'

function Stat({ label, value, accent, hint }: { label: string; value: string; accent?: boolean; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <p className={cn('font-mono text-sm font-semibold tabular-nums', accent ? 'text-signal' : 'text-ink')}>{value}</p>
      <p className="mt-0.5 font-mono text-xs text-quiet">{label}</p>
      {hint && <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-quiet">{hint}</p>}
    </div>
  )
}

/**
 * A campaign in a list: status, channel, progress, rates. The whole card
 * links to the campaign; `actions` (passed by the screen) sit in a fixed
 * footer above that link. Shared by the home and the campaigns screen.
 */
export function CampaignCard({ campaign, actions }: { campaign: DashboardCampaign; actions?: React.ReactNode }) {
  const status = t.status[campaign.status] ?? { tone: 'neutral' as const, label: campaign.status }
  const isLinkedIn = campaign.firstStepChannel === 'LINKEDIN'
  const progress = campaign.targetCount > 0 ? Math.min(100, (campaign.contactedCount / campaign.targetCount) * 100) : 0
  const emailed = (campaign.emailSentCount ?? 0) > 0

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-raised transition-colors duration-200 ease-signal hover:border-quiet/50">
      <Link href={`/dashboard/campaigns/${campaign.id}`} className="absolute inset-0 z-[1] rounded-lg focus-visible:outline-offset-0" aria-label={t.open(campaign.name)} />

      <div className="flex-1 p-5 pb-4">
        <div className="mb-3 flex items-center gap-2">
          <Badge tone={status.tone} live={campaign.status === 'active'}>{status.label}</Badge>
          <span className="inline-flex items-center gap-1 font-mono text-xs text-quiet">
            {isLinkedIn ? <Linkedin className="h-3 w-3" aria-hidden="true" /> : <Mail className="h-3 w-3" aria-hidden="true" />}
            {isLinkedIn ? t.linkedin : t.email}
          </span>
          {campaign.aiPersonalization && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-quiet">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {t.personalised}
            </span>
          )}
        </div>

        <h3 className="text-[15px] font-semibold leading-snug text-ink">{campaign.name}</h3>
        {campaign.industry && <p className="mt-0.5 text-xs text-quiet">{campaign.industry}</p>}

        {campaign.status !== 'draft' ? (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="font-mono text-xs tabular-nums text-quiet">
                <span className="text-ink">{campaign.contactedCount.toLocaleString('fr-FR')}</span>
                {' '}/ {campaign.targetCount.toLocaleString('fr-FR')} {t.contacted}
              </span>
              <span className="font-mono text-xs tabular-nums text-ink">{progress.toFixed(0)} %</span>
            </div>
            <div className="h-0.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={t.contactedLabel}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-line">
              <div className="pr-3"><Stat label={t.openRate} value={emailed ? formatPercent(campaign.openRate) : '-'} hint={emailed ? t.openHint : undefined} /></div>
              <div className="px-3">
                <Stat label={t.replyRate} value={campaign.contactedCount > 0 ? formatPercent(campaign.replyRate) : '-'} accent
                  hint={campaign.repliedCount !== undefined && campaign.contactedCount > 0 ? `${campaign.repliedCount} / ${campaign.contactedCount} leads` : undefined} />
              </div>
              <div className="pl-3"><Stat label={t.conversion} value={formatPercent(campaign.conversionRate)} /></div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-line px-3 py-2.5">
            <BarChart2 className="h-3.5 w-3.5 text-quiet" aria-hidden="true" />
            <span className="text-xs text-quiet">{t.draft}</span>
          </div>
        )}
      </div>

      {actions && <div className="relative z-[2] flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">{actions}</div>}
    </article>
  )
}
