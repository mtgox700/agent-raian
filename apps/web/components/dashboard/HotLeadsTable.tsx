'use client'

/**
 * HotLeadsTable: card list of qualified or positive leads.
 *
 *  - One accent per card, keyed to the reply: gold when a person said yes
 *    (positive, meeting), danger for a negative reply, neutral otherwise.
 *  - Reply snippet in a quote block (never raw headers).
 *  - Score (machine signal, cyan) and source campaign.
 *  - Always-visible actions (not hover-only).
 *  - `focusId`: highlights and scrolls to one lead (driven by ?lid=).
 *  - Optimistic status updates via PATCH /api/leads/[id]/status.
 */

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import { BADGE_THRESHOLDS } from '@/lib/leads/badges'
import { createPortal } from 'react-dom'
import {
  Flame, CheckCircle2, Trophy, XCircle,
  Building2, Mail, ChevronDown,
  MessageSquareQuote, Megaphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge, LEAD_STATUS, type StatusTone } from '@/components/ui/status-badge'
import type { HotLead } from '@/lib/repositories/leads.repository'

// ─── Reply classification ─────────────────────────────────────────────────────

interface ClassConfig {
  label:  string
  tone:   StatusTone
  accent: string   // left accent bar
  dot:    string   // avatar dot
}

const HUMAN_YES = { tone: 'human' as const, accent: 'before:bg-gold', dot: 'bg-gold' }
const HUMAN_NO  = { tone: 'danger' as const, accent: 'before:bg-danger/70', dot: 'bg-danger' }
const NEUTRAL   = { tone: 'neutral' as const, accent: 'before:bg-border', dot: 'bg-muted' }

const CLASSIFICATION_CONFIG: Record<string, ClassConfig> = {
  POSITIVE:        { label: 'Positif',       ...HUMAN_YES },
  MEETING_REQUEST: { label: 'Rendez-vous',   ...HUMAN_YES },
  NEUTRAL:         { label: 'Neutre',        ...NEUTRAL },
  NEGATIVE:        { label: 'Négatif',       ...HUMAN_NO },
  NOT_INTERESTED:  { label: 'Pas intéressé', ...NEUTRAL },
}

const DEFAULT_CLASS_CONFIG: ClassConfig = { label: 'Inconnu', ...NEUTRAL }

function getClassConfig(c: string | null): ClassConfig {
  if (!c) return DEFAULT_CLASS_CONFIG
  return CLASSIFICATION_CONFIG[c] ?? DEFAULT_CLASS_CONFIG
}

// ─── Score ────────────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return null
  const color =
    // The badge thresholds (lib/leads/badges), not a colour scale of its own.
    score >= BADGE_THRESHOLDS.FAST_TRACK ? 'text-cyan border-cyan/25' :
    score >= BADGE_THRESHOLDS.NORMAL     ? 'text-white border-border' :
                                           'text-muted border-border'
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] leading-5 tabular-nums', color)}>
      <span className="sr-only">Score </span>{score}
    </span>
  )
}

// ─── Time ago ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return '-'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins}min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

// ─── Quick actions menu ───────────────────────────────────────────────────────

const STATUS_ACTIONS = [
  { status: 'contacted',  label: 'Marquer contacté', icon: CheckCircle2, color: 'text-cyan' },
  { status: 'qualified',  label: 'Qualifier',        icon: Flame,        color: 'text-gold' },
  { status: 'converted',  label: 'Deal gagné',       icon: Trophy,       color: 'text-success-fg' },
  { status: 'lost',       label: 'Deal perdu',       icon: XCircle,      color: 'text-danger' },
] as const

interface QuickActionsProps {
  leadId:        string
  currentStatus: string
  onStatusChange: (leadId: string, status: string) => void
}

function QuickActions({ leadId, currentStatus, onStatusChange }: QuickActionsProps) {
  const [open, setOpen]       = useState(false)
  const [isPending, startTx]  = useTransition()
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const btnRef                = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Escape closes the menu and gives focus back to its button.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const openMenu = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    // rect.bottom is already viewport-relative: no scrollY for position:fixed
    setMenuPos({
      top:   rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
    setOpen(true)
  }, [])

  const handleSelect = (status: string) => {
    setOpen(false)
    startTx(async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}/status`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status }),
        })
        if (res.ok) onStatusChange(leadId, status)
      } catch {
        // silent: optimistic update already applied
      }
    })
  }

  const menu = open && mounted ? createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        role="menu"
        aria-label="Changer le statut"
        className="fixed z-[9999] w-48 overflow-hidden rounded-md border border-border bg-obsidian py-1"
        style={{ top: menuPos.top, right: menuPos.right }}
      >
        {STATUS_ACTIONS.filter((a) => a.status !== currentStatus).map(({ status, label, icon: Icon, color }) => (
          <button
            key={status}
            type="button"
            role="menuitem"
            onClick={() => handleSelect(status)}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-medium text-muted transition-colors duration-150 ease-signal hover:bg-white/[0.04] hover:text-white focus-visible:bg-white/[0.04] focus-visible:text-white focus-visible:outline-none"
          >
            <Icon className={cn('h-3.5 w-3.5', color)} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted transition-colors duration-150 ease-signal hover:border-cyan/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-50"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform duration-150 ease-signal', open && 'rotate-180')} aria-hidden="true" />
        Statut
      </button>
      {menu}
    </>
  )
}

// ─── Lead card ────────────────────────────────────────────────────────────────

interface CardRowProps {
  lead:           HotLead
  focused:        boolean
  onStatusChange: (leadId: string, status: string) => void
}

function HotLeadCard({ lead, focused, onStatusChange }: CardRowProps) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const cfg      = getClassConfig(lead.lastReplyClassification)
  const status   = LEAD_STATUS[lead.status] ?? LEAD_STATUS.new

  // Scroll into view when this card is the focused one
  useEffect(() => {
    if (focused && cardRef.current) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      cardRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' })
    }
  }, [focused])

  const initials = `${lead.firstName[0] ?? ''}${lead.lastName[0] ?? ''}`.toUpperCase()

  return (
    <div
      ref={cardRef}
      className={cn(
        'relative flex items-start gap-4 overflow-hidden rounded-[10px] border bg-obsidian py-4 pl-6 pr-5',
        'before:absolute before:inset-y-0 before:left-0 before:w-0.5',
        cfg.accent,
        focused ? 'border-cyan/60' : 'border-border',
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface font-mono text-xs font-semibold text-white">
          {initials}
        </div>
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-obsidian', cfg.dot)} aria-hidden="true" />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-white">
            {lead.firstName} {lead.lastName}
          </p>
          <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <ScorePill score={lead.aiScore} />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {lead.company && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              {lead.company}
            </span>
          )}
          {lead.title && (
            <span className="max-w-[180px] truncate">{lead.title}</span>
          )}
          {lead.campaignName && (
            <span className="flex items-center gap-1 font-mono">
              <Megaphone className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              {lead.campaignName}
            </span>
          )}
        </div>

        {lead.lastReplySnippet && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-void px-3 py-2">
            <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted" aria-hidden="true" />
            <p className="line-clamp-2 text-xs leading-relaxed text-white/75">
              {lead.lastReplySnippet}
            </p>
          </div>
        )}
      </div>

      {/* Actions: always visible */}
      <div className="flex flex-shrink-0 flex-col items-end gap-2">
        <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted">
          {timeAgo(lead.lastReplyAt)}
        </span>

        <div className="flex items-center gap-2">
          <a
            href={`mailto:${lead.email}`}
            title="Répondre par e-mail"
            aria-label={`Répondre par e-mail à ${lead.firstName} ${lead.lastName}`}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors duration-150 ease-signal hover:border-cyan/40 hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <QuickActions
            leadId={lead.id}
            currentStatus={lead.status}
            onStatusChange={onStatusChange}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HotLeadsTableProps {
  initialLeads: HotLead[]
  focusId?:     string   // highlight + scroll to this lead (from ?lid= query param)
}

export function HotLeadsTable({ initialLeads, focusId }: HotLeadsTableProps) {
  const [leads, setLeads] = useState(initialLeads)

  const handleStatusChange = useCallback((leadId: string, status: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status } : l))
    )
  }, [])

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-[10px] border border-dashed border-border py-20">
        <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-border">
          <Flame className="h-6 w-6 text-gold" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">Aucun lead chaud pour l&apos;instant</p>
          <p className="mt-1 text-xs text-muted">
            Dès qu&apos;un prospect répond positivement, il apparaîtra ici
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {leads.map((lead) => (
        <HotLeadCard
          key={lead.id}
          lead={lead}
          focused={lead.id === focusId}
          onStatusChange={handleStatusChange}
        />
      ))}
    </div>
  )
}
