'use client'

/**
 * The hot leads, one card each: who, the reply's classification and the
 * lead's status, score, company and source campaign, the reply snippet, how
 * long ago, and always-visible actions (reply by e-mail, change the status).
 * `focusId` (from ?lid= on a notification) scrolls to and marks one lead.
 * Status changes go through leads.updateStatus, as in body n°1.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Building2, CheckCircle2, ChevronDown, Flame, Mail, Megaphone, MessageSquareQuote, Trophy, XCircle } from 'lucide-react'
import { Badge, EmptyState, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/front/api'
import { BADGE_THRESHOLDS } from '@/lib/leads/badges'
import { hotLeadsCopy as t } from '@/lib/copy/hot-leads'
import { leadStatus } from '@/lib/copy/leads'
import type { HotLead } from '@/lib/front/types-hot-leads'

type NewStatus = (typeof t.statusActions)[number]['status']

const ACTION_ICON = {
  contacted: { icon: CheckCircle2, color: 'text-accent' },
  qualified: { icon: Flame,        color: 'text-signal' },
  converted: { icon: Trophy,       color: 'text-success' },
  lost:      { icon: XCircle,      color: 'text-danger' },
} as const

/** The accent bar of a card: a person said yes (signal), no (danger), or neither. */
const ACCENT: Record<string, string> = { signal: 'bg-signal', danger: 'bg-danger/70', neutral: 'bg-line' }
const DOT: Record<string, string> = { signal: 'bg-signal', danger: 'bg-danger', neutral: 'bg-quiet' }

function classification(c: string | null) {
  return (c && t.classification[c]) || t.unknownClassification
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return null
  // The badge thresholds (lib/leads/badges), not a colour scale of its own.
  const tone = score >= BADGE_THRESHOLDS.FAST_TRACK ? 'border-accent/40 text-accent'
    : score >= BADGE_THRESHOLDS.NORMAL ? 'border-line text-ink'
    : 'border-line text-quiet'
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] leading-5 tabular-nums', tone)}>
      <span className="sr-only">{t.score}</span>{score}
    </span>
  )
}

function StatusMenu({ leadId, currentStatus, onStatusChange }: {
  leadId: string
  currentStatus: string
  onStatusChange: (leadId: string, status: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTx] = useTransition()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Escape closes and gives focus back to the button; a click outside closes.
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus()
    }
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  // Up/down arrows move between the items.
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next]?.focus()
  }

  const handleSelect = (status: NewStatus) => {
    setOpen(false)
    btnRef.current?.focus()
    startTx(async () => {
      try {
        await api.call('leads.updateStatus', { params: { leadId }, body: { status } })
        onStatusChange(leadId, status)
      } catch {
        // silent, as in body n°1: the status stays as it was
      }
    })
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 gap-1 px-2.5 text-xs')}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 ease-signal', open && 'rotate-180')} aria-hidden="true" />
        {t.statusButton}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t.statusMenu}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md border border-line bg-raised py-1"
        >
          {t.statusActions.filter((a) => a.status !== currentStatus).map(({ status, label }) => {
            const { icon: Icon, color } = ACTION_ICON[status]
            return (
              <button
                key={status}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(status)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink focus-visible:bg-surface focus-visible:text-ink"
              >
                <Icon className={cn('h-3.5 w-3.5', color)} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HotLeadCard({ lead, focused, onStatusChange }: {
  lead: HotLead
  focused: boolean
  onStatusChange: (leadId: string, status: string) => void
}) {
  const cardRef = useRef<HTMLLIElement>(null)
  const cfg = classification(lead.lastReplyClassification)
  const status = leadStatus(lead.status)
  const name = `${lead.firstName} ${lead.lastName}`
  const initials = `${lead.firstName[0] ?? ''}${lead.lastName[0] ?? ''}`.toUpperCase()

  useEffect(() => {
    if (!focused || !cardRef.current) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    cardRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' })
  }, [focused])

  return (
    <li
      ref={cardRef}
      aria-current={focused ? 'true' : undefined}
      className={cn(
        'relative flex flex-col gap-4 rounded-lg border bg-raised py-4 pl-6 pr-4 sm:flex-row sm:items-start sm:pr-5',
        focused ? 'border-accent/70' : 'border-line',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-0.5 rounded-l-lg', ACCENT[cfg.tone] ?? ACCENT.neutral)} aria-hidden="true" />

      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="relative shrink-0" aria-hidden="true">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface font-mono text-xs font-semibold text-ink">
            {initials}
          </span>
          <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-raised', DOT[cfg.tone] ?? DOT.neutral)} />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-ink">{name}</h2>
            <Badge tone={cfg.tone}>{cfg.label}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
            <ScorePill score={lead.aiScore} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-quiet">
            {lead.company && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                {lead.company}
              </span>
            )}
            {lead.title && <span className="max-w-[180px] truncate">{lead.title}</span>}
            {lead.campaignName && (
              <span className="flex items-center gap-1 font-mono">
                <Megaphone className="h-3 w-3 shrink-0" aria-hidden="true" />
                {lead.campaignName}
              </span>
            )}
          </div>

          {lead.lastReplySnippet && (
            <blockquote className="flex items-start gap-2 rounded-md border border-line bg-canvas px-3 py-2">
              <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
              <p className="line-clamp-2 text-sm leading-relaxed text-ink/80">{lead.lastReplySnippet}</p>
            </blockquote>
          )}
        </div>
      </div>

      {/* Actions: always visible. */}
      <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end">
        <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-quiet">
          {lead.lastReplyAt ? <time dateTime={lead.lastReplyAt}>{t.ago(lead.lastReplyAt)}</time> : t.ago(null)}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={`mailto:${lead.email}`}
            title={t.replyTitle}
            aria-label={t.replyLabel(name)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 w-8 px-0')}
          >
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <StatusMenu leadId={lead.id} currentStatus={lead.status} onStatusChange={onStatusChange} />
        </div>
      </div>
    </li>
  )
}

export function HotLeadsList({ initialLeads, focusId }: { initialLeads: HotLead[]; focusId?: string }) {
  const [leads, setLeads] = useState(initialLeads)

  const handleStatusChange = useCallback((leadId: string, status: string) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)))
  }, [])

  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line py-12">
        <EmptyState icon={Flame} title={t.emptyTitle}>{t.emptyBody}</EmptyState>
      </div>
    )
  }

  return (
    <ul className="space-y-3" aria-label={t.listLabel}>
      {leads.map((lead) => (
        <HotLeadCard key={lead.id} lead={lead} focused={lead.id === focusId} onStatusChange={handleStatusChange} />
      ))}
    </ul>
  )
}
