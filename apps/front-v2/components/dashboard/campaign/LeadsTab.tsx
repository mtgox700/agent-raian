'use client'

/** The campaign's leads: stage counts, the paged list (10 a page), the lead panel, « Trouver des leads ». */
import { useState } from 'react'
import { Building2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search, User } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { LeadDetailDrawer } from '@/components/dashboard/shared/LeadDetailDrawer'
import { campaignCopy, LEAD_STATUS, SCORE_BADGE, leadsTabCopy as t } from '@/lib/copy/campaign'
import type { CampaignLeadCounts, CampaignLeadRow } from '@/lib/front/types-campaigns'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10
const statusOf = (status: string) => LEAD_STATUS[status] ?? { tone: 'neutral' as const, label: status }

function PageButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} disabled={disabled} title={label} aria-label={label} className="h-8 w-8 px-0">
      {children}
    </Button>
  )
}

export function LeadsTab({ leads, leadCounts, isLoading, onFindLeads }: {
  leads: CampaignLeadRow[]
  leadCounts: CampaignLeadCounts
  isLoading: boolean
  onFindLeads: () => void
}) {
  const [detailLead, setDetailLead] = useState<CampaignLeadRow | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  // Clamped: a shrinking list never leaves the user on an empty page.
  const pageCount = Math.max(1, Math.ceil(leads.length / PAGE_SIZE))
  const safePage = Math.min(pageIndex, pageCount - 1)
  const paged = leads.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const rangeStart = leads.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, leads.length)

  const pages = Array.from({ length: pageCount }, (_, i) => i)
    .filter((i) => i === 0 || i === pageCount - 1 || Math.abs(i - safePage) <= 1)
    .reduce<number[]>((acc, i, idx, arr) => {
      if (idx > 0 && i - arr[idx - 1] > 1) acc.push(-1)
      acc.push(i)
      return acc
    }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {t.stages.map(([key, label]) => {
          const count = leadCounts[key]
          if (count === 0) return null
          return <Badge key={key} tone={statusOf(key).tone}><span className="tabular-nums">{count}</span> {label}</Badge>
        })}
        <div className="ml-auto flex items-center gap-2">
          {leadCounts.total > 0 && <span className="font-mono text-xs tabular-nums text-quiet">{t.total(leadCounts.total)}</span>}
          <Button type="button" size="sm" variant="outline" onClick={onFindLeads} disabled={isLoading}>
            {isLoading ? <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
            {isLoading ? t.searching : t.find}
          </Button>
        </div>
      </div>

      {leads.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-line px-4 py-12">
          <div className="text-center">
            <p className="text-sm font-semibold text-ink">{t.emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-quiet">{t.emptyBody}</p>
          </div>
          <ol className="w-full max-w-xs space-y-1.5">
            {t.emptySteps.map(({ n, label, desc }) => (
              <li key={n} className="flex items-baseline gap-2.5 rounded-md border border-line px-3 py-2 font-mono text-xs">
                <span className="tabular-nums text-accent">{n}</span>
                <span className="text-ink">{label}</span>
                <span className="text-quiet">{desc}</span>
              </li>
            ))}
          </ol>
          <Button type="button" size="sm" onClick={onFindLeads} disabled={isLoading}>
            <Search className="h-4 w-4" aria-hidden="true" />
            {t.launchAi}
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <ul className="divide-y divide-line">
            {paged.map((lead) => {
              const badge = SCORE_BADGE[lead.scoreBadge] ?? SCORE_BADGE.UNSCORED
              const status = statusOf(lead.status)
              return (
                <li key={lead.id}>
                  <button
                    type="button"
                    aria-label={t.open(`${lead.firstName} ${lead.lastName}`)}
                    onClick={() => setDetailLead(lead)}
                    className="flex w-full items-center gap-4 bg-raised px-4 py-3 text-left transition-colors duration-200 ease-signal hover:bg-surface/50 focus-visible:outline-offset-[-2px]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface"><User className="h-4 w-4 text-quiet" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ink">{lead.firstName} {lead.lastName}</span>
                      <span className="flex items-center gap-1.5 text-xs text-quiet">
                        {lead.company && (
                          <>
                            <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{lead.company}</span>
                            {lead.title && <span>·</span>}
                          </>
                        )}
                        {lead.title && <span className="truncate">{lead.title}</span>}
                      </span>
                    </span>
                    <Badge tone={badge.tone} className="max-sm:hidden">{badge.label}</Badge>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {lead.lastReplyAt && (
                      <span className="flex flex-col items-end text-right font-mono text-xs max-sm:hidden">
                        <span className="text-quiet">{t.replied}</span>
                        <span className="tabular-nums text-signal">{campaignCopy.ago(lead.lastReplyAt)}</span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {leads.length > PAGE_SIZE && (
            <nav aria-label={t.pagination} className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-raised px-4 py-3">
              <span className="font-mono text-xs tabular-nums text-quiet">{t.range(rangeStart, rangeEnd, leads.length)}</span>
              <div className="flex items-center gap-1">
                <PageButton label={t.first} onClick={() => setPageIndex(0)} disabled={safePage === 0}><ChevronsLeft className="h-4 w-4" aria-hidden="true" /></PageButton>
                <PageButton label={t.prev} onClick={() => setPageIndex(Math.max(0, safePage - 1))} disabled={safePage === 0}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></PageButton>
                {pages.map((i, idx) => i === -1 ? (
                  <span key={`gap-${idx}`} className="px-1 font-mono text-xs text-quiet" aria-hidden="true">…</span>
                ) : (
                  <Button
                    key={i}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPageIndex(i)}
                    aria-label={t.page(i + 1)}
                    aria-current={i === safePage ? 'page' : undefined}
                    className={cn('h-8 min-w-8 border px-2 font-mono text-xs tabular-nums', i === safePage ? 'border-accent/40 bg-accent/[0.08] text-accent hover:text-accent' : 'border-transparent')}
                  >
                    {i + 1}
                  </Button>
                ))}
                <PageButton label={t.next} onClick={() => setPageIndex(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1}><ChevronRight className="h-4 w-4" aria-hidden="true" /></PageButton>
                <PageButton label={t.last} onClick={() => setPageIndex(pageCount - 1)} disabled={safePage >= pageCount - 1}><ChevronsRight className="h-4 w-4" aria-hidden="true" /></PageButton>
              </div>
            </nav>
          )}
        </div>
      )}

      <LeadDetailDrawer lead={detailLead} onClose={() => setDetailLead(null)} onLeadUpdated={setDetailLead} />
    </div>
  )
}
