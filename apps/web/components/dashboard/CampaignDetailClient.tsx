'use client'

/**
 * CampaignDetailClient
 *
 * Full detail view for a single campaign with three tabs:
 *  1. Résumé : hero stats + sequence timeline
 *  2. Étapes : StepComparisonTable
 *  3. Leads : live lead list + inline AI prospecting
 */

import { formatPercent } from '@/lib/format/percent'
import { useState, useCallback, useRef, useEffect, useId } from 'react'
import { useRouter }                       from 'next/navigation'
import Link                                  from 'next/link'
import {
  ArrowLeft, BarChart3, Mail, MessageSquare, Search, Check, X,
  Users, User, Building2, RefreshCw, AlertCircle,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Sparkles,
} from 'lucide-react'
import { Button, buttonVariants }         from '@/components/ui/button'
import { StatusBadge, CAMPAIGN_STATUS, LEAD_STATUS, type StatusTone } from '@/components/ui/status-badge'
import { StepComparisonTable }             from '@/components/dashboard/StepComparisonTable'
import { SequenceTimeline }               from '@/components/sequences/SequenceTimeline'
import { LeadSearchDrawer }               from '@/components/dashboard/LeadSearchDrawer'
import { LeadDetailDrawer }               from '@/components/dashboard/LeadDetailDrawer'
import { LeadSearchProgress, usePipelineStream } from '@/components/dashboard/LeadSearchProgress'
import { cn }                             from '@/lib/utils'
import type { StepStats }                 from '@/lib/services/campaign-stats.service'
import type { Plan }                      from '@prisma/client'
import type { ApolloSearchParams, LeadWithEnrichment, PipelineSummary, CompanySize } from '@/lib/types/lead'
import type { ProgressState }             from '@/components/dashboard/LeadSearchProgress'
import { SendStatusBanner }               from '@/components/dashboard/campaigns/SendStatusBanner'
import { InsightsPanel }                  from '@/components/dashboard/InsightsPanel'
import { CampaignSenderCard }             from '@/components/dashboard/campaigns/CampaignSenderCard'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignDetailData {
  id:              string
  name:            string
  status:          string
  goal:            string
  /** Messages sent, every channel (lib/campaigns/metrics: from the rows). */
  sentCount:       number
  messagesByChannel: Record<string, number>
  emailOpenedCount: number
  /** Leads contacted (≥ 1 message sent) and leads who replied, refusals included. */
  contactedCount:  number
  repliedCount:    number
  /** replied / contacted, with its 95 % Wilson interval. */
  replyRate:       { rate: number; low: number; high: number }
  /** Leads of the campaign marked converted. */
  convertedCount:  number
  /** Leads in the campaign. */
  leadCount:       number
  targetIndustry:  string | null
  targetTitles:    string[]
  targetCompanySizes: string[]
  targetGeos:      string[]
  createdAt:       string
  completedAt:     string | null
  lastProcessedAt: string | null
  /** Only AI_PROSPECTING campaigns collect leads in the background. */
  leadSource:      string
  /** Channel splits: precise "X emails · Y messages LinkedIn" display. */
  sentEmailCount:     number
  sentLinkedInCount:  number
  replyEmailCount:    number
  replyLinkedInCount: number
  /** Leads whose sequence stopped automatically because they replied. */
  stoppedOnReplyCount: number
}

export interface LeadRow {
  id:                      string
  firstName:               string
  lastName:                string
  email:                   string
  company:                 string | null
  title:                   string | null
  status:                  string
  scoreBadge:              string
  lastReplyAt:             string | null
  lastReplyClassification: string | null
  // Lead detail drawer fields (parity with the leads page)
  industry:                string | null
  linkedinUrl:             string | null
  website:                 string | null
  country:                 string | null
  companySize:             CompanySize | null
  source:                  string
  apolloId:                string | null
  aiScore:                 number | null
  scoreReason:             string | null
  createdAt:               string
  enrichment: {
    emailVerified:       boolean
    emailConfidence:     number | null
    emailStatus:         string | null
    headline?:           string | null
    city?:               string | null
    companyDescription?: string | null
    companyLinkedinUrl?: string | null
    technologies?:       string[]
  } | null
}

export interface LeadCounts {
  total:     number
  new:       number
  contacted: number
  qualified: number
  converted: number
  lost:      number
}

interface CampaignDetailClientProps {
  campaign:     CampaignDetailData
  stepStats:    StepStats[]
  leadCounts:   LeadCounts
  leads:        LeadRow[]
  workspaceId:  string
  /** The workspace's real plan: drives the locked filters of the lead search. */
  plan:         Plan
  /** EmailSend records stuck in PENDING: surfaced as a "Relancer" button. */
  pendingCount: number
  /** Qualified leads with an uncertain email, held from auto-send. */
  unverifiedCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NEUTRAL_STATUS = { tone: 'neutral' as StatusTone, label: 'Brouillon' }

/** Lead status: shared tone map (a reply is human, a conversion a success). */
function leadStatus(status: string): { tone: StatusTone; label: string } {
  return LEAD_STATUS[status] ?? { tone: 'neutral', label: status }
}

const GOAL_LABELS: Record<string, string> = {
  LEADS:     'Génération de leads',
  DEMOS:     'Démonstrations',
  SALES:     'Ventes directes',
  AWARENESS: 'Notoriété',
}

/** Score badge: same names as LeadScoreBadge, tone instead of a colour. */
const SCORE_BADGE: Record<string, { tone: StatusTone; label: string }> = {
  FAST_TRACK: { tone: 'success', label: 'Fast Track' },
  NORMAL:     { tone: 'signal',  label: 'Normal'     },
  NURTURE:    { tone: 'warning', label: 'Nurture'    },
  SKIP:       { tone: 'danger',  label: 'Écarté'     },
  UNSCORED:   { tone: 'neutral', label: 'Non scoré'  },
}

/** Outcome of a user action, carried as data: never read back from a glyph. */
interface ActionResult {
  ok:   boolean
  text: string
}

function ActionResultLine({ result }: { result: ActionResult }) {
  const Icon = result.ok ? Check : X
  return (
    <p
      role="status"
      className={cn('mt-1 flex items-center gap-1 text-xs', result.ok ? 'text-success-fg' : 'text-danger')}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      {result.text}
    </p>
  )
}

const INITIAL_PROGRESS: ProgressState = {
  phase:       'idle',
  searchFound: 0,
  searchTotal: 0,
  enriched:    0,
  enrichTotal: 0,
  scored:      0,
  scoreTotal:  0,
  summary:     null,
  error:       null,
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return "à l'instant"
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  if (h < 24)    return `${h}h`
  return `${Math.floor(h / 24)}j`
}

/** Convert a pipeline lead (LeadWithEnrichment) to the LeadRow shape used in the table */
function pipelineLeadToRow(l: LeadWithEnrichment): LeadRow {
  return {
    id:                      l.id,
    firstName:               l.firstName,
    lastName:                l.lastName,
    email:                   l.email,
    company:                 l.company,
    title:                   l.title,
    status:                  l.status,
    scoreBadge:              l.scoreBadge,
    // Pipeline-returned leads are always fresh: no reply yet
    lastReplyAt:             null,
    lastReplyClassification: null,
    industry:                l.industry,
    linkedinUrl:             l.linkedinUrl,
    website:                 l.website,
    country:                 l.country,
    companySize:             l.companySize,
    source:                  l.source,
    apolloId:                l.apolloId,
    aiScore:                 l.aiScore,
    scoreReason:             l.scoreReason,
    createdAt:               l.createdAt,
    enrichment:              l.enrichment,
  }
}

/** Convert a LeadRow back to LeadWithEnrichment for the detail drawer */
function leadRowToWithEnrichment(l: LeadRow): LeadWithEnrichment {
  return {
    id:          l.id,
    firstName:   l.firstName,
    lastName:    l.lastName,
    email:       l.email,
    company:     l.company,
    title:       l.title,
    industry:    l.industry,
    linkedinUrl: l.linkedinUrl,
    website:     l.website,
    country:     l.country,
    companySize: l.companySize,
    source:      l.source,
    apolloId:    l.apolloId,
    aiScore:     l.aiScore,
    scoreBadge:  l.scoreBadge as LeadWithEnrichment['scoreBadge'],
    scoreReason: l.scoreReason,
    status:      l.status,
    createdAt:   l.createdAt,
    enrichment:  l.enrichment,
  }
}

/** Compute live LeadCounts from current lead array */
function computeLeadCounts(leads: LeadRow[]): LeadCounts {
  const counts: LeadCounts = { total: leads.length, new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
  for (const l of leads) {
    const key = l.status as keyof Omit<LeadCounts, 'total'>
    if (key in counts) (counts[key] as number)++
  }
  return counts
}

function mergeLeadCounts(a: LeadCounts, b: LeadCounts): LeadCounts {
  return {
    total:     Math.max(a.total, b.total),
    new:       Math.max(a.new, b.new),
    contacted: Math.max(a.contacted, b.contacted),
    qualified: Math.max(a.qualified, b.qualified),
    converted: Math.max(a.converted, b.converted),
    lost:      Math.max(a.lost, b.lost),
  }
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'resume' | 'steps' | 'leads'

const TABS: { key: Tab; label: string; Icon: typeof BarChart3 }[] = [
  { key: 'resume', label: 'Résumé', Icon: BarChart3 },
  { key: 'steps',  label: 'Étapes', Icon: Mail      },
  { key: 'leads',  label: 'Leads',  Icon: Users     },
]

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, tone, sub }: {
  label: string
  value: string
  /** Text colour class of the figure: cyan = machine, gold = human. */
  tone:  string
  /** Channel breakdown line, e.g. "25 e-mails · 30 LinkedIn". */
  sub?:  string
}) {
  return (
    <div className="rounded-[10px] border border-border bg-obsidian p-4">
      <p className="font-mono text-xs text-muted">{label}</p>
      <p className={cn('mt-2 font-mono text-2xl font-semibold tabular-nums', tone)}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

const CHANNEL_WORDS: Record<string, [string, string]> = {
  EMAIL: ['e-mail', 'e-mails'],
  LINKEDIN: ['message LinkedIn', 'messages LinkedIn'],
  WHATSAPP: ['WhatsApp', 'WhatsApp'],
  SMS: ['SMS', 'SMS'],
}

/** "25 e-mails · 30 messages LinkedIn · 2 SMS": every channel, none blended. */
function messagesBreakdown(byChannel: Record<string, number>): string | undefined {
  const parts = Object.entries(byChannel)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => `${n.toLocaleString('fr-FR')} ${(CHANNEL_WORDS[ch] ?? [ch.toLowerCase(), ch.toLowerCase()])[n > 1 ? 1 : 0]}`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}


// ─── Resume tab ───────────────────────────────────────────────────────────────

function ResumeTab({ campaign, stepStats }: { campaign: CampaignDetailData; stepStats: StepStats[] }) {
  const sent      = campaign.sentCount
  // Opens on emails only (an estimate); replies per lead contacted, not per message.
  const emails    = campaign.sentEmailCount
  const openRate  = emails > 0 ? (campaign.emailOpenedCount / emails) * 100 : 0
  const replyRate = campaign.replyRate.rate * 100
  // Converted leads out of the campaign's leads (a count of leads, not emails).
  const convRate  = campaign.leadCount > 0 ? (campaign.convertedCount / campaign.leadCount) * 100 : 0

  const timelineSteps = stepStats.map((s) => ({
    id:        s.stepId,
    position:  s.position,
    dayOffset: s.dayOffset,
    subject:   s.subject,
    channel:   s.channel,
  }))

  return (
    <div className="space-y-6">
      {/* Hero stats, channel-precise: e-mails and LinkedIn DMs never blended */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Messages envoyés"
          value={sent.toLocaleString('fr-FR')}
          tone="text-cyan"
          sub={messagesBreakdown(campaign.messagesByChannel)}
        />
        <StatCard
          label="Taux d'ouverture"
          value={emails > 0 ? formatPercent(openRate) : '-'}
          tone="text-white"
          sub={emails > 0
            ? `Indicatif, ${sent > emails ? 'e-mails uniquement, ' : ''}${campaign.emailOpenedCount} sur ${emails}`
            : sent > 0 ? 'Non mesurable hors e-mail' : undefined}
        />
        <StatCard
          label="Taux de réponse"
          value={campaign.contactedCount > 0 ? formatPercent(replyRate) : '-'}
          tone="text-gold"
          sub={campaign.contactedCount > 0
            ? `${campaign.repliedCount} lead${campaign.repliedCount > 1 ? 's' : ''} sur ${campaign.contactedCount} contacté${campaign.contactedCount > 1 ? 's' : ''} · IC 95 % ${formatPercent(campaign.replyRate.low * 100)}-${formatPercent(campaign.replyRate.high * 100)}`
            : undefined}
        />
        <StatCard
          label="Conversions"
          value={formatPercent(convRate)}
          tone="text-success-fg"
          sub={`${campaign.convertedCount} lead${campaign.convertedCount > 1 ? 's' : ''} converti${campaign.convertedCount > 1 ? 's' : ''} sur ${campaign.leadCount}`}
        />
      </div>

      {campaign.stoppedOnReplyCount > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-gold" aria-hidden="true" />
          {campaign.stoppedOnReplyCount} séquence{campaign.stoppedOnReplyCount > 1 ? 's' : ''} arrêtée{campaign.stoppedOnReplyCount > 1 ? 's' : ''} automatiquement dès la réponse du prospect : aucune relance ne lui a été envoyée ensuite.
        </p>
      )}

      {/* Sequence timeline */}
      {timelineSteps.length > 0 && (
        <div>
          <h3 className="mb-3 font-mono text-xs text-muted">
            Séquence
          </h3>
          <div className="rounded-[10px] border border-border bg-obsidian p-4">
            <SequenceTimeline steps={timelineSteps} />
          </div>
        </div>
      )}

      {/* Campaign meta */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Industrie cible', value: campaign.targetIndustry ?? '-'              },
          { label: 'Objectif',        value: GOAL_LABELS[campaign.goal] ?? campaign.goal  },
          { label: 'Créée le',        value: new Date(campaign.createdAt).toLocaleDateString('fr-FR') },
          ...(campaign.completedAt ? [{
            label: 'Terminée le',
            value: new Date(campaign.completedAt).toLocaleDateString('fr-FR'),
          }] : []),
          ...(campaign.lastProcessedAt ? [{
            label: 'Dernier passage',
            value: timeAgo(campaign.lastProcessedAt),
          }] : []),
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[10px] border border-border bg-obsidian px-4 py-3">
            <p className="font-mono text-xs text-muted">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Leads tab ────────────────────────────────────────────────────────────────

function LeadsTab({
  leads,
  leadCounts,
  isLoading,
  onFindLeads,
}: {
  leads:       LeadRow[]
  leadCounts:  LeadCounts
  isLoading:   boolean
  onFindLeads: () => void
}) {
  const STAGE_LABELS: [keyof LeadCounts, string][] = [
    ['new',       'Nouveaux'  ],
    ['contacted', 'Contactés' ],
    ['qualified', 'Qualifiés' ],
    ['converted', 'Convertis' ],
    ['lost',      'Perdus'    ],
  ]

  const [detailLead, setDetailLead] = useState<LeadRow | null>(null)

  // Pagination: same UX as /leads (10 per page). Clamped so a shrinking list
  // (filter/refresh) never leaves the user on an empty out-of-range page.
  const PAGE_SIZE = 10
  const [pageIndex, setPageIndex] = useState(0)
  const pageCount  = Math.max(1, Math.ceil(leads.length / PAGE_SIZE))
  const safePage   = Math.min(pageIndex, pageCount - 1)
  const pagedLeads = leads.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const rangeStart = leads.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const rangeEnd   = Math.min((safePage + 1) * PAGE_SIZE, leads.length)

  return (
    <div className="space-y-4">
      {/* Header row: status pills + find-leads button */}
      <div className="flex flex-wrap items-center gap-2">
        {STAGE_LABELS.map(([key, label]) => {
          const count = leadCounts[key]
          if (count === 0) return null
          return (
            <StatusBadge key={key} tone={leadStatus(key).tone}>
              <span className="tabular-nums">{count}</span> {label}
            </StatusBadge>
          )
        })}
        <div className="ml-auto flex items-center gap-2">
          {leadCounts.total > 0 && (
            <span className="font-mono text-xs tabular-nums text-muted">{leadCounts.total} leads au total</span>
          )}
          {/* Always show the "Find more leads" button */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onFindLeads}
            disabled={isLoading}
            className="gap-1.5"
          >
            {isLoading
              ? <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
              : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
            {isLoading ? 'Recherche en cours…' : 'Trouver des leads'}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {leads.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center gap-4 rounded-[10px] border border-dashed border-border px-4 py-12">
          <div className="text-center">
            <p className="text-sm font-semibold text-white">Aucun lead dans cette campagne</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
              Lancez une recherche : les comptes trouvés sont enrichis, leurs e-mails vérifiés,
              puis chaque lead reçoit un score.
            </p>
          </div>

          {/* What the run does, step by step (what it does, not who supplies it) */}
          <ol className="w-full max-w-xs space-y-1.5">
            {[
              { n: '1', label: 'Recherche des comptes',      desc: 'selon votre ciblage' },
              { n: '2', label: 'Vérification des e-mails',   desc: 'avant tout envoi'    },
              { n: '3', label: "Score d'adéquation",         desc: 'de 0 à 100'          },
            ].map(({ n, label, desc }) => (
              <li key={n} className="flex items-baseline gap-2.5 rounded-md border border-border px-3 py-2 font-mono text-xs">
                <span className="tabular-nums text-cyan">{n}</span>
                <span className="text-white">{label}</span>
                <span className="text-muted">{desc}</span>
              </li>
            ))}
          </ol>

          <Button type="button" size="sm" onClick={onFindLeads} disabled={isLoading} className="gap-2">
            <Search className="h-4 w-4" aria-hidden="true" />
            Lancer la prospection IA
          </Button>
        </div>
      ) : (
        /* Lead rows */
        <div className="overflow-hidden rounded-[10px] border border-border">
          <div className="divide-y divide-border">
            {pagedLeads.map((lead) => {
              const badge  = SCORE_BADGE[lead.scoreBadge] ?? SCORE_BADGE['UNSCORED']!
              const status = leadStatus(lead.status)

              return (
                <div
                  key={lead.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ouvrir la fiche de ${lead.firstName} ${lead.lastName}`}
                  onClick={() => setDetailLead(lead)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailLead(lead) }
                  }}
                  className="flex cursor-pointer items-center gap-4 bg-obsidian px-4 py-3 transition-colors duration-150 ease-signal hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan"
                >
                  {/* Avatar */}
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-surface">
                    <User className="h-4 w-4 text-muted" aria-hidden="true" />
                  </div>

                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">
                      {lead.firstName} {lead.lastName}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      {lead.company && (
                        <>
                          <Building2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                          <span className="truncate">{lead.company}</span>
                          {lead.title && <span>·</span>}
                        </>
                      )}
                      {lead.title && <span className="truncate">{lead.title}</span>}
                    </div>
                  </div>

                  {/* Score badge */}
                  <StatusBadge tone={badge.tone} className="hidden sm:inline-flex">{badge.label}</StatusBadge>

                  {/* Status */}
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>

                  {/* Last reply */}
                  {lead.lastReplyAt && (
                    <div className="hidden flex-col items-end text-right font-mono text-xs sm:flex">
                      <span className="text-muted">Répondu</span>
                      <span className="tabular-nums text-gold">
                        {timeAgo(lead.lastReplyAt)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination: same UX as /leads */}
          {leads.length > PAGE_SIZE && (
            <nav aria-label="Pagination des leads" className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-obsidian px-4 py-3">
              <span className="font-mono text-xs tabular-nums text-muted">
                {rangeStart}-{rangeEnd} sur {leads.length} lead{leads.length > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  onClick={() => setPageIndex(0)}
                  disabled={safePage === 0}
                  title="Première page"
                  aria-label="Première page"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  onClick={() => setPageIndex(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  title="Page précédente"
                  aria-label="Page précédente"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>

                {Array.from({ length: pageCount }, (_, i) => i)
                  .filter((i) => i === 0 || i === pageCount - 1 || Math.abs(i - safePage) <= 1)
                  .reduce<number[]>((acc, i, idx, arr) => {
                    if (idx > 0 && i - arr[idx - 1] > 1) acc.push(-1)
                    acc.push(i)
                    return acc
                  }, [])
                  .map((i, idx) =>
                    i === -1 ? (
                      <span key={`gap-${idx}`} className="px-1 font-mono text-xs text-muted" aria-hidden="true">…</span>
                    ) : (
                      <Button
                        key={i}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPageIndex(i)}
                        aria-label={`Page ${i + 1}`}
                        aria-current={i === safePage ? 'page' : undefined}
                        className={cn(
                          'h-8 min-w-8 border px-2 font-mono text-xs tabular-nums',
                          i === safePage ? 'border-cyan/40 bg-cyan/[0.08] text-cyan hover:text-cyan' : 'border-transparent',
                        )}
                      >
                        {i + 1}
                      </Button>
                    ),
                  )}

                <Button
                  onClick={() => setPageIndex(Math.min(pageCount - 1, safePage + 1))}
                  disabled={safePage >= pageCount - 1}
                  title="Page suivante"
                  aria-label="Page suivante"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  onClick={() => setPageIndex(pageCount - 1)}
                  disabled={safePage >= pageCount - 1}
                  title="Dernière page"
                  aria-label="Dernière page"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <ChevronsRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </nav>
          )}
        </div>
      )}

      {/* Mega-pro lead detail slide-over (same as the leads page) */}
      <LeadDetailDrawer
        lead={detailLead ? leadRowToWithEnrichment(detailLead) : null}
        onClose={() => setDetailLead(null)}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CampaignDetailClient({
  campaign,
  stepStats,
  leadCounts: initialLeadCounts,
  leads:        initialLeads,
  workspaceId,
  plan,
  pendingCount: initialPendingCount,
  unverifiedCount: initialUnverifiedCount,
}: CampaignDetailClientProps) {
  const router   = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('resume')
  // Unique ids: Next keeps a hidden copy of a visited route, fixed ids collided.
  const tabsId = useId()

  // Tabs pattern (WAI-ARIA): arrows move between tabs, Home and End jump.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    setActiveTab(TABS[next].key)
    tabRefs.current[next]?.focus()
  }

  // ── Pipeline state ────────────────────────────────────────────────────────
  const [liveLeads,    setLiveLeads]    = useState<LeadRow[]>(initialLeads)
  const [drawerOpen,   setDrawerOpen]   = useState(false)
  const [progress,     setProgress]     = useState<ProgressState>(INITIAL_PROGRESS)
  const [pendingCount, setPendingCount] = useState(initialPendingCount)
  const [retrying,     setRetrying]     = useState(false)
  const [retryMsg,     setRetryMsg]     = useState<ActionResult | null>(null)
  const [autoPolling,  setAutoPolling]  = useState(false)
  const [unverifiedCount, setUnverifiedCount] = useState(initialUnverifiedCount)
  const [contacting,   setContacting]   = useState(false)
  const [contactMsg,   setContactMsg]   = useState<ActionResult | null>(null)
  const abortRef       = useRef<AbortController | null>(null)
  // Latest lead count + whether any lead is still UNSCORED: read inside the
  // polling interval without stale closures. Leads are saved BEFORE they're
  // scored, so we must keep polling until scoring lands (no UNSCORED left).
  const leadCountRef   = useRef(initialLeads.length)
  const hasUnscoredRef = useRef(initialLeads.some((l) => l.scoreBadge === 'UNSCORED'))

  const handleRetryPending = async () => {
    if (retrying) return
    setRetrying(true)
    setRetryMsg(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/retry-pending`, { method: 'POST' })
      const data = await res.json() as {
        success?: boolean
        stats?:   { queued: number; active: boolean }
        error?:   string
      }
      if (res.ok && data.success && data.stats) {
        const { queued, active } = data.stats
        setRetryMsg(active
          ? { ok: true,  text: `Envoi relancé : ${queued} message${queued > 1 ? 's' : ''} partent au rythme de votre boîte` }
          : { ok: false, text: 'Campagne en pause : réactivez-la pour reprendre les envois' })
        setPendingCount(queued)
        router.refresh()
      } else {
        setRetryMsg({ ok: false, text: data.error ?? 'Erreur de relance' })
      }
    } catch (err) {
      setRetryMsg({ ok: false, text: err instanceof Error ? err.message : 'Erreur réseau' })
    } finally {
      setRetrying(false)
      setTimeout(() => setRetryMsg(null), 6000)
    }
  }

  const handleContactUnverified = async () => {
    if (contacting) return
    setContacting(true)
    setContactMsg(null)
    try {
      const res  = await fetch(`/api/campaigns/${campaign.id}/contact-unverified`, { method: 'POST' })
      const data = await res.json() as { success?: boolean; stats?: { queued: number; attempted: number }; error?: string }
      if (res.ok && data.success && data.stats) {
        setContactMsg({ ok: true, text: `${data.stats.queued} e-mail${data.stats.queued > 1 ? 's' : ''} en cours d'envoi` })
        setUnverifiedCount(0)
        router.refresh()
      } else {
        setContactMsg({ ok: false, text: data.error ?? 'Erreur' })
      }
    } catch (err) {
      setContactMsg({ ok: false, text: err instanceof Error ? err.message : 'Erreur réseau' })
    } finally {
      setContacting(false)
      setTimeout(() => setContactMsg(null), 6000)
    }
  }

  const { consume } = usePipelineStream()

  // Keep the uncertain-email count in sync after server refreshes.
  useEffect(() => { setUnverifiedCount(initialUnverifiedCount) }, [initialUnverifiedCount])

  // Database totals (all leads), or the live list while a prospecting run
  // streams in more leads than were loaded.
  const liveLeadCounts = mergeLeadCounts(initialLeadCounts, computeLeadCounts(liveLeads))
  const isLoading      = progress.phase !== 'idle' && progress.phase !== 'done' && progress.phase !== 'error'

  // Auto-refresh the campaign data when the page mounts with few leads: this
  // happens right after `createCampaign` + wizard redirect, while the
  // background pipeline is still saving/scoring leads server-side. We poll
  // every 4 seconds for the first ~3 minutes after creation to surface new
  // leads without requiring a manual refresh. Stops polling when:
  //   - lead count stops growing for 2 consecutive ticks
  //   - 45 ticks elapsed (~3 min hard cap)
  //   - user starts an explicit pipeline run from this page
  useEffect(() => {
    // Auto-refresh while the background Inngest pipeline collects leads, so the
    // user never has to refresh manually.
    //
    // KEY: with Inngest the leads are saved in ONE burst at the END of the run
    // (~1-2 min for 200), not progressively. So we must keep polling through the
    // long "0 leads" phase and only stop AFTER leads have appeared and then
    // stabilised: never stop just because the count is still 0.
    const createdAtMs = new Date(campaign.createdAt as unknown as string).getTime()
    if (Date.now() - createdAtMs > 6 * 60_000) return   // older campaign: skip
    if (initialLeads.length >= 100) return               // already populated
    // Existing-base and CSV campaigns collect nothing in the background: the
    // "Prospection IA en cours" banner was shown on them by mistake.
    if (campaign.leadSource !== 'AI_PROSPECTING') return
    // A draft (a copy made from an alert) collects nothing on its own either.
    if (campaign.status === 'DRAFT') return

    setAutoPolling(true)
    let stable   = 0
    let last     = leadCountRef.current
    let sawLeads = leadCountRef.current > 0
    let ticks    = 0
    const MAX_TICKS = 75 // 75 × 4s = 5 min hard cap

    const stop = () => { clearInterval(interval); setAutoPolling(false) }

    const interval = setInterval(() => {
      ticks++
      if (ticks > MAX_TICKS) return stop()
      // Don't fight an explicit manual pipeline run on this page.
      if (progress.phase !== 'idle' && progress.phase !== 'done') return

      router.refresh() // re-render the server component with fresh DB data

      const n = leadCountRef.current
      if (n > 0) sawLeads = true
      // Finished only when leads arrived, the count is stable AND scoring landed
      // (no UNSCORED left): otherwise we'd stop on the unscored burst and the
      // user would need a manual refresh to see scores.
      if (n === last && !hasUnscoredRef.current) {
        if (sawLeads) { stable++; if (stable >= 2) stop() }
      } else {
        stable = 0
        last   = n
      }
    }, 4_000)

    return () => stop()
    // Run once per campaign mount; the interval reads live state via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id])

  // When server props change (after router.refresh), sync into local state so
  // the leads table updates without losing the user's tab / filter state.
  useEffect(() => {
    setLiveLeads(initialLeads)
    leadCountRef.current   = initialLeads.length
    hasUnscoredRef.current = initialLeads.some((l) => l.scoreBadge === 'UNSCORED')
  }, [initialLeads])

  const handleSearch = useCallback(async (params: ApolloSearchParams) => {
    setDrawerOpen(false)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setProgress({
      phase:       'search',
      searchFound: 0,
      searchTotal: params.limit,
      enriched:    0,
      enrichTotal: 0,
      scored:      0,
      scoreTotal:  0,
      summary:     null,
      error:       null,
    })

    try {
      await consume(
        params,
        (event) => {
          setProgress((prev) => {
            switch (event.type) {
              case 'search_start':    return { ...prev, phase: 'search',  searchTotal: event.total }
              case 'search_progress': return { ...prev, searchFound: event.found }
              case 'search_done':     return { ...prev, searchFound: event.saved }
              case 'enrich_start':    return { ...prev, phase: 'enrich',  enrichTotal: event.total }
              case 'enrich_progress': return { ...prev, enriched: event.enriched, enrichTotal: event.total }
              case 'enrich_done':     return { ...prev, enriched: event.verified }
              case 'score_start':     return { ...prev, phase: 'score',   scoreTotal: event.total }
              case 'score_progress':  return { ...prev, scored: event.scored, scoreTotal: event.total }
              case 'score_done':      return { ...prev, scored: prev.scoreTotal }
              case 'pipeline_done': {
                const newLeads = (event.leads as LeadWithEnrichment[]).map(pipelineLeadToRow)
                setLiveLeads((current) => {
                  const existingIds = new Set(current.map((l) => l.id))
                  const toAdd = newLeads.filter((l) => !existingIds.has(l.id))
                  return [...toAdd, ...current]
                })
                return { ...prev, phase: 'done', summary: event.summary as PipelineSummary }
              }
              case 'error':
                return { ...prev, phase: 'error', error: event.message }
              default:
                return prev
            }
          })
        },
        abortRef.current.signal
      )
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setProgress((prev) => ({ ...prev, phase: 'error', error: err.message }))
      }
    }
  }, [consume])

  // ── Render ────────────────────────────────────────────────────────────────

  const status     = campaign.status.toLowerCase()
  const statusConf = CAMPAIGN_STATUS[status] ?? NEUTRAL_STATUS

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Back + title */}
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            aria-label="Retour"
            className="mt-0.5 h-8 w-8 flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>

          <div>
            <h1 className="font-display text-xl font-semibold text-white">{campaign.name}</h1>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-muted">
              {liveLeadCounts.total} lead{liveLeadCounts.total !== 1 ? 's' : ''} ·{' '}
              {messagesBreakdown(campaign.messagesByChannel)
                ? `${messagesBreakdown(campaign.messagesByChannel)} envoyé${campaign.sentCount > 1 ? 's' : ''}`
                : '0 message envoyé'}
              {pendingCount > 0 && (
                <>
                  {' '}·{' '}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetryPending}
                    disabled={retrying}
                    className="h-7 border-cyan/30 px-2 font-mono text-xs text-cyan hover:border-cyan/50"
                    title="Les messages partent un par un, au rythme sûr de votre boîte, jusqu'à son plafond quotidien"
                  >
                    {retrying ? 'Relance…' : `${pendingCount} en cours d'envoi`}
                  </Button>
                </>
              )}
            </p>
            {retryMsg && <ActionResultLine result={retryMsg} />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The Analyst, opened on this campaign: the question is prefilled, never sent. */}
          <Link
            href={`/dashboard/analyst?q=${encodeURIComponent(`Pourquoi la campagne « ${campaign.name} » a ces chiffres, et que changer ?`)}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan" aria-hidden="true" />
            Pourquoi ces chiffres ?
          </Link>
          <StatusBadge tone={statusConf.tone} live={status === 'active'}>{statusConf.label}</StatusBadge>
        </div>
      </div>

      {/* ── Sending status: why queued messages wait, and until when ───────── */}
      <SendStatusBanner campaignId={campaign.id} initialQueued={pendingCount} />
      <InsightsPanel campaignId={campaign.id} />

      {/* ── Draft: what to do with it, and that nothing leaves before ─────────── */}
      {status === 'draft' && liveLeadCounts.total === 0 && (
        <div className="rounded-[10px] border border-cyan/25 bg-obsidian px-4 py-3 text-sm text-white" role="status">
          <p className="font-semibold text-white">Brouillon : rien ne part tant que vous ne le lancez pas.</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-muted">
            <li>Trouvez les leads du nouveau segment avec « Lancer la prospection IA » ci-dessous : choisissez d’autres postes, secteurs ou tailles.</li>
            <li>Lancez-le depuis la <Link href="/dashboard/campaigns" className="font-semibold text-cyan hover:underline">liste des campagnes</Link>, bouton « Lancer ».</li>
          </ol>
        </div>
      )}

      {/* ── Live prospecting banner ─────────────────────────────────────────── */}
      {autoPolling && (
        <div className="flex items-center gap-3 rounded-[10px] border border-cyan/25 bg-obsidian px-4 py-3" role="status">
          <RefreshCw className="h-4 w-4 flex-shrink-0 text-cyan motion-safe:animate-spin" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">
              Prospection IA en cours…
              {liveLeadCounts.total > 0 && (
                <span className="ml-2 font-mono text-xs tabular-nums text-cyan">
                  {liveLeadCounts.total} lead{liveLeadCounts.total > 1 ? 's' : ''} déjà collecté{liveLeadCounts.total > 1 ? 's' : ''}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Recherche, vérification des e-mails et score se font en arrière-plan. Les leads apparaissent ici d&apos;eux-mêmes : pas besoin de rafraîchir.
            </p>
          </div>
        </div>
      )}

      {/* ── Uncertain-email prompt: the user decides (no silent block) ───────── */}
      {unverifiedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-warning/25 bg-obsidian px-4 py-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-warning">
              {unverifiedCount} lead{unverifiedCount > 1 ? 's' : ''} avec un e-mail incertain
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Leur adresse n&apos;a pas pu être vérifiée : ils n&apos;ont pas été contactés, pour protéger votre délivrabilité. Les contacter quand même ?
            </p>
            {contactMsg && <ActionResultLine result={contactMsg} />}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleContactUnverified}
            disabled={contacting}
            className="gap-1.5 border-warning/40 hover:border-warning/60"
          >
            {contacting
              ? <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
              : <Mail className="h-3.5 w-3.5" aria-hidden="true" />}
            {contacting ? 'Envoi…' : 'Contacter quand même'}
          </Button>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Vues de la campagne" className="flex items-center gap-1 rounded-[10px] border border-border bg-obsidian p-1">
        {TABS.map(({ key, label, Icon }, index) => (
          <Button
            key={key}
            ref={(el) => { tabRefs.current[index] = el }}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${key}`}
            aria-selected={activeTab === key}
            aria-controls={`${tabsId}-panel`}
            tabIndex={activeTab === key ? 0 : -1}
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab(key)}
            onKeyDown={(e) => onTabKey(e, index)}
            className={cn(
              'flex-1 gap-2',
              activeTab === key ? 'bg-surface text-white' : 'text-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
            {key === 'leads' && liveLeadCounts.total > 0 && (
              <span className="font-mono text-xs tabular-nums text-muted">
                {liveLeadCounts.total}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${activeTab}`} tabIndex={0} className="rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40">
        {activeTab === 'resume' && (
          <div className="space-y-4">
            {campaign.status !== 'COMPLETED' && <CampaignSenderCard campaignId={campaign.id} />}
            <ResumeTab campaign={campaign} stepStats={stepStats} />
          </div>
        )}
        {activeTab === 'steps' && (
          <StepComparisonTable steps={stepStats} />
        )}
        {activeTab === 'leads' && (
          <LeadsTab
            leads={liveLeads}
            leadCounts={liveLeadCounts}
            isLoading={isLoading}
            onFindLeads={() => setDrawerOpen(true)}
          />
        )}
      </div>

      {/* ── Lead search drawer (pre-filled from campaign targeting) ─────────── */}
      <LeadSearchDrawer
        open={drawerOpen}
        workspaceId={workspaceId}
        campaignId={campaign.id}
        plan={plan}
        onUpgrade={() => router.push('/dashboard/settings?tab=billing')}
        defaultTitles={campaign.targetTitles}
        defaultIndustry={campaign.targetIndustry ?? undefined}
        defaultSizes={campaign.targetCompanySizes as CompanySize[]}
        defaultCountry={campaign.targetGeos[0]}
        onClose={() => setDrawerOpen(false)}
        onSearch={handleSearch}
        isLoading={isLoading}
      />

      {/* ── Pipeline progress overlay ────────────────────────────────────────── */}
      <LeadSearchProgress
        state={progress}
        onDismiss={() => setProgress(INITIAL_PROGRESS)}
      />
    </div>
  )
}
