'use client'

/**
 * CommandCenter: Main dashboard shell.
 *
 * Layout (banger edition):
 *  Row 0: Today snapshot bar (new leads / emails sent / replies today)
 *  Row 1-6 animated metric KPI cards (real data)
 *  Row 2-30-day performance chart (2/3) + AI classification donut (1/3)
 *  Row 3: Pipeline funnel (1/3) + Active campaigns (2/3)
 *  Row 4: Email health widget (1/3) + Activity feed (2/3)
 *
 * All data comes from the server via `stats` prop: zero mock.
 */

import { ArrowUpRight } from 'lucide-react'
import { MetricCard }          from '@/components/dashboard/MetricCard'
import { InsightsPanel }       from '@/components/dashboard/InsightsPanel'
import { ActivityFeed }        from '@/components/dashboard/ActivityFeed'
import { PipelineFunnel }      from '@/components/dashboard/PipelineFunnel'
import { RevenueChart }        from '@/components/dashboard/RevenueChart'
import { CampaignCard }        from '@/components/dashboard/CampaignCard'
import { ClassificationDonut } from '@/components/dashboard/ClassificationDonut'
import { EmailHealthWidget }   from '@/components/dashboard/EmailHealthWidget'
import type { RealDashboardStats } from '@/lib/services/dashboard.service'

// ─── Today snapshot bar ───────────────────────────────────────────────────────

interface SnapshotItemProps {
  label: string
  value: number
  color: string
  index: number
}

function SnapshotItem({ label, value, color }: SnapshotItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-border bg-obsidian px-4 py-3">
      <span className="h-px w-3 flex-shrink-0" style={{ background: color }} aria-hidden="true" />
      <span className="font-mono text-xs text-muted">{label}</span>
      <span className="ml-auto font-display text-lg font-semibold tabular-nums text-white">
        {value > 0 ? `+${value}` : '0'}
      </span>
    </div>
  )
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-white">
      {label}
      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </a>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CommandCenterProps {
  firstName: string
  stats:     RealDashboardStats
}

export function CommandCenter({ firstName, stats }: CommandCenterProps) {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  // Capitalise first letter
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1)

  return (
    <div className="min-h-full space-y-6 pb-8">

      {/* Header. No "agents actifs" pulse here: it was always on, whatever
          the campaigns were doing. */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="font-mono text-xs text-muted">{todayLabel}</p>
          <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-white">
            {`Bonjour, ${firstName}`}
          </h1>
        </div>
        <a
          href="/dashboard/campaigns/new"
          className="inline-flex h-9 items-center rounded-md bg-cyan px-4 text-sm font-semibold text-void transition-colors hover:bg-cyan-300"
        >
          Nouvelle campagne
        </a>
      </div>

      <InsightsPanel />

      {/* ── Today snapshot ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3">
        <SnapshotItem
          label="Nouveaux leads aujourd'hui"
          value={stats.todaySnapshot.newLeads}
          color="var(--brand-primary)"
          index={0}
        />
        <SnapshotItem
          label="E-mails envoyés aujourd'hui"
          value={stats.todaySnapshot.emailsSent}
          color="var(--gold)"
          index={1}
        />
        <SnapshotItem
          label="Réponses aujourd'hui"
          value={stats.todaySnapshot.replies}
          color="var(--success)"
          index={2}
        />
      </div>

      {/* ── KPI metric cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {stats.metrics.map((metric, i) => (
          <MetricCard key={metric.id} metric={metric} index={i} />
        ))}
      </div>

      {/* ── 30-day chart + AI donut ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={stats.chartData} />
        </div>
        <div className="lg:col-span-1">
          <ClassificationDonut data={stats.classifications} />
        </div>
      </div>

      {/* ── Pipeline + Campaigns ─────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PipelineFunnel stages={stats.pipeline} />
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-[10px] border border-border bg-obsidian p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-xs text-muted">Campagnes en cours</h2>
              <SectionLink href="/dashboard/campaigns" label="Voir tout" />
            </div>

            {stats.topCampaigns.length === 0 ? (
              <div className="flex flex-col items-start gap-3 border-t border-border py-8">
                <p className="text-sm text-white">Aucune campagne active.</p>
                <p className="max-w-[28rem] text-sm leading-relaxed text-muted">
                  Décrivez votre client idéal : les agents trouvent les leads, écrivent la séquence, et vous la relisez avant l&apos;envoi.
                </p>
                <a
                  href="/dashboard/campaigns/new"
                  className="mt-1 inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-white transition-colors hover:border-white/30"
                >
                  Créer une campagne
                </a>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.topCampaigns.map((campaign, i) => (
                  <CampaignCard key={campaign.id} campaign={campaign} index={i} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Email health + Activity feed ─────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <EmailHealthWidget data={stats.emailHealth} />
        </div>
        <div className="lg:col-span-2" style={{ maxHeight: 380 }}>
          <ActivityFeed />
        </div>
      </div>

    </div>
  )
}
