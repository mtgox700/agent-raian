import { MessageSquare } from 'lucide-react'
import { SequenceTimeline } from '@/components/dashboard/shared/SequenceTimeline'
import { campaignCopy, resumeCopy as t } from '@/lib/copy/campaign'
import { formatPercent } from '@/lib/format/percent'
import type { CampaignDetailData, CampaignStepStats } from '@/lib/front/types-campaigns'
import { cn } from '@/lib/utils'

/** "25 e-mails · 30 messages LinkedIn · 2 SMS": every channel, none blended. */
export function messagesBreakdown(byChannel: Record<string, number>): string | undefined {
  const parts = Object.entries(byChannel)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => `${n.toLocaleString('fr-FR')} ${(t.channelWords[ch] ?? [ch.toLowerCase(), ch.toLowerCase()])[n > 1 ? 1 : 0]}`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function StatCard({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-raised p-4">
      <p className="font-mono text-xs text-quiet">{label}</p>
      <p className={cn('mt-2 font-mono text-2xl font-semibold tabular-nums', tone)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-quiet">{sub}</p>}
    </div>
  )
}

/** Hero figures (channel-precise), the sequence and the campaign facts. */
export function ResumeTab({ campaign, stepStats }: { campaign: CampaignDetailData; stepStats: CampaignStepStats[] }) {
  const sent = campaign.sentCount
  const emails = campaign.sentEmailCount
  const openRate = emails > 0 ? (campaign.emailOpenedCount / emails) * 100 : 0
  const convRate = campaign.leadCount > 0 ? (campaign.convertedCount / campaign.leadCount) * 100 : 0

  const facts = [
    { label: t.industry, value: campaign.targetIndustry ?? '-' },
    { label: t.goal, value: campaignCopy.goals[campaign.goal] ?? campaign.goal },
    { label: t.created, value: new Date(campaign.createdAt).toLocaleDateString('fr-FR') },
    ...(campaign.completedAt ? [{ label: t.completed, value: new Date(campaign.completedAt).toLocaleDateString('fr-FR') }] : []),
    ...(campaign.lastProcessedAt ? [{ label: t.lastRun, value: campaignCopy.ago(campaign.lastProcessedAt) }] : []),
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t.sent} value={sent.toLocaleString('fr-FR')} tone="text-accent" sub={messagesBreakdown(campaign.messagesByChannel)} />
        <StatCard
          label={t.openRate}
          value={emails > 0 ? formatPercent(openRate) : '-'}
          tone="text-ink"
          sub={emails > 0 ? t.openSub(sent > emails, campaign.emailOpenedCount, emails) : sent > 0 ? t.notMeasurable : undefined}
        />
        <StatCard
          label={t.replyRate}
          value={campaign.contactedCount > 0 ? formatPercent(campaign.replyRate.rate * 100) : '-'}
          tone="text-signal"
          sub={campaign.contactedCount > 0
            ? t.replySub(campaign.repliedCount, campaign.contactedCount, formatPercent(campaign.replyRate.low * 100), formatPercent(campaign.replyRate.high * 100))
            : undefined}
        />
        <StatCard label={t.conversions} value={formatPercent(convRate)} tone="text-success" sub={t.convSub(campaign.convertedCount, campaign.leadCount)} />
      </div>

      {campaign.stoppedOnReplyCount > 0 && (
        <p className="flex items-center gap-2 text-xs text-quiet">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
          {t.stopped(campaign.stoppedOnReplyCount)}
        </p>
      )}

      {stepStats.length > 0 && (
        <div>
          <h3 className="mb-3 font-mono text-xs text-quiet">{t.sequence}</h3>
          <div className="rounded-lg border border-line bg-raised p-4">
            <SequenceTimeline steps={stepStats.map((s) => ({ id: s.stepId, position: s.position, dayOffset: s.dayOffset, subject: s.subject, channel: s.channel }))} />
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {facts.map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-line bg-raised px-4 py-3">
            <dt className="font-mono text-xs text-quiet">{label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
