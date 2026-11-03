import Link from 'next/link'
import { ArrowUpRight, Megaphone } from 'lucide-react'
import { EmptyState, Panel, buttonVariants } from '@/components/ui'
import { ActivityChart } from '@/components/dashboard/home/ActivityChart'
import { ActivityFeed } from '@/components/dashboard/home/ActivityFeed'
import { ClassificationDonut } from '@/components/dashboard/home/ClassificationDonut'
import { EmailHealth } from '@/components/dashboard/home/EmailHealth'
import { MetricCard } from '@/components/dashboard/home/MetricCard'
import { PipelineFunnel } from '@/components/dashboard/home/PipelineFunnel'
import { CampaignCard } from '@/components/dashboard/shared/CampaignCard'
import { InsightsPanel } from '@/components/dashboard/shared/InsightsPanel'
import { home } from '@/lib/app-copy'
import type { DashboardStats } from '@/lib/front/types'

/** Today's three counters: a tick in the tone of who did it, the figure. */
function Snapshot({ label, value, tick }: { label: string; value: number; tick: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-raised px-4 py-3">
      <span className={`h-px w-3 shrink-0 ${tick}`} aria-hidden="true" />
      <span className="font-mono text-xs text-quiet">{label}</span>
      <span className="ml-auto font-display text-lg font-semibold tabular-nums text-ink">{value > 0 ? `+${value}` : '0'}</span>
    </div>
  )
}

/**
 * /dashboard, the command center (body n°1's order): greeting and the one
 * primary action, open alerts, today, the KPI cards, 14 days of activity and
 * how replies were classified, the lead funnel and running campaigns, send
 * health and the live feed. Every figure comes from views.dashboard.
 */
export function CommandCenter({ firstName, stats }: { firstName: string; stats: DashboardStats }) {
  // The day in the brand's locale and time zone (rendered on the server).
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1)

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="font-mono text-xs text-quiet">{todayLabel}</p>
          <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink">{home.hello(firstName)}</h1>
        </div>
        <Link href={home.newCampaignHref} className={buttonVariants({ size: 'sm' })}>{home.newCampaign}</Link>
      </div>

      <InsightsPanel />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Snapshot label={home.snapshot.newLeads} value={stats.todaySnapshot.newLeads} tick="bg-accent" />
        <Snapshot label={home.snapshot.emailsSent} value={stats.todaySnapshot.emailsSent} tick="bg-signal" />
        <Snapshot label={home.snapshot.replies} value={stats.todaySnapshot.replies} tick="bg-success" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {stats.metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><ActivityChart data={stats.chartData} /></div>
        <div><ClassificationDonut data={stats.classifications} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div><PipelineFunnel stages={stats.pipeline} /></div>
        <div className="lg:col-span-2">
          <Panel
            title={home.campaigns.title}
            action={
              <Link href="/dashboard/campaigns" className="flex items-center gap-1 text-xs text-quiet transition-colors duration-200 ease-signal hover:text-ink">
                {home.campaigns.seeAll}
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
            className="h-full"
          >
            {stats.topCampaigns.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                align="start"
                title={home.campaigns.emptyTitle}
                action={<Link href={home.newCampaignHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{home.campaigns.create}</Link>}
                className="border-t border-line"
              >
                {home.campaigns.emptyBody}
              </EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.topCampaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div><EmailHealth data={stats.emailHealth} /></div>
        <div className="lg:col-span-2"><ActivityFeed /></div>
      </div>
    </div>
  )
}
