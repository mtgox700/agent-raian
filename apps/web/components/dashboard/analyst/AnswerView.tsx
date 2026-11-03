'use client'

/**
 * An Analyst answer, rendered from its four sections. Never raw HTML: every
 * line is text, **bold** spans and [T3] citations become elements. Each
 * citation opens the evidence it points to, with a link to the campaign.
 */

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ShieldCheck, ExternalLink, X } from 'lucide-react'
import type { AnswerStatus, Evidence } from './types'

const TOOL_LABELS: Record<string, string> = {
  list_campaigns: 'Liste de vos campagnes',
  campaign_facts: 'Faits de la campagne',
  diagnose_campaign: 'Diagnostic de la campagne',
  compare_campaigns: 'Comparaison statistique',
  segment_breakdown: 'Réponses par segment',
  message_excerpt: 'Message de la séquence',
}

function campaignOf(e: Evidence): { id: string; name: string } | null {
  const d = e.data as { campaignId?: string; name?: string; campaign?: { id?: string; name?: string } } | null
  const id = d?.campaignId ?? d?.campaign?.id
  const name = d?.name ?? d?.campaign?.name
  return id ? { id, name: name ?? 'Campagne' } : null
}

function summaryOf(e: Evidence): string[] {
  const d = e.data as Record<string, unknown> | null
  if (!d) return []
  if (Array.isArray(d.diagnoses)) {
    const list = d.diagnoses as Array<{ title: string; evidence: string[] }>
    return list.length ? list.map((x) => `${x.title} : ${x.evidence.join(', ')}`) : ['Aucun problème détecté par les règles.']
  }
  if (Array.isArray(d.campaigns)) return [`${(d.campaigns as unknown[]).length} campagne(s) consultée(s).`]
  if (Array.isArray(d.comparisons)) {
    return (d.comparisons as Array<{ a: { label: string }; b: { label: string }; verdict: string }>).map((c) => `${c.a.label} face à ${c.b.label} : ${c.verdict}`)
  }
  if (Array.isArray(d.segments)) return [`${(d.segments as unknown[]).length} segment(s) comparé(s), résultats exploratoires.`]
  return []
}

function Inline({ text, onCite, evidenceRefs }: { text: string; onCite: (ref: string) => void; evidenceRefs: Set<string> }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[T\d+\])/g).filter(Boolean)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
        const ref = /^\[(T\d+)\]$/.exec(p)?.[1]
        if (ref) {
          const known = evidenceRefs.has(ref)
          return (
            <button
              key={i} type="button" disabled={!known} onClick={() => onCite(ref)}
              aria-label={`Voir la preuve ${ref}`}
              className="mx-0.5 inline-flex min-h-[22px] items-center rounded-md border border-cyan/25 bg-cyan/[0.07] px-1.5 align-baseline font-mono text-[11px] font-semibold text-cyan transition-colors hover:border-cyan/50 hover:bg-cyan/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan disabled:opacity-50"
            >
              {ref}
            </button>
          )
        }
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}

const HEADING = /^\s*(?:#+\s*)?\*\*([^*]+)\*\*\s*:?\s*(.*)$/

export function AnswerView({ text, status, evidence }: { text: string; status?: AnswerStatus | null; evidence?: Evidence[] | null }) {
  const [open, setOpen] = useState<string | null>(null)
  const refs = new Set((evidence ?? []).map((e) => e.ref))
  const selected = (evidence ?? []).find((e) => e.ref === open)
  const panel = useRef<HTMLDivElement>(null)

  // The evidence opens under the answer, often below the composer: bring it into view.
  useEffect(() => {
    if (!open) return
    panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    panel.current?.focus({ preventScroll: true })
  }, [open])

  if (status && status !== 'ok') {
    return (
      <div className="flex gap-3 rounded-[10px] border border-warning/30 bg-warning/[0.06] p-4" role="status">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-white/85">{text}</p>
      </div>
    )
  }

  const lines = text.split('\n')
  return (
    <div className="space-y-1">
      <div className="space-y-1.5 text-sm leading-relaxed text-white/85">
        {lines.map((line, i) => {
          if (!line.trim()) return null
          const h = HEADING.exec(line)
          if (h) {
            return (
              <div key={i} className={i > 0 ? 'pt-3' : ''}>
                <p className="text-[11px] font-mono font-medium text-cyan/80">{h[1]}</p>
                {h[2] && <p className="mt-1 text-[15px] font-medium text-white"><Inline text={h[2]} onCite={setOpen} evidenceRefs={refs} /></p>}
              </div>
            )
          }
          const bullet = /^\s*[-•]\s+(.*)$/.exec(line)
          if (bullet) return <p key={i} className="flex gap-2 pl-1"><span className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-muted" aria-hidden="true" /><span><Inline text={bullet[1]} onCite={setOpen} evidenceRefs={refs} /></span></p>
          const num = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
          if (num) return <p key={i} className="flex gap-2.5 pl-1"><span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-cyan/30 font-mono text-[11px] font-bold text-cyan tabular-nums">{num[1]}</span><span><Inline text={num[2]} onCite={setOpen} evidenceRefs={refs} /></span></p>
          return <p key={i}><Inline text={line} onCite={setOpen} evidenceRefs={refs} /></p>
        })}
      </div>

      <p className="flex items-center gap-1.5 pt-3 text-[11px] text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-success-fg" aria-hidden="true" />
        Chaque chiffre a été vérifié dans vos données. Touchez une référence pour voir sa source.
      </p>

      {selected && (
        <div ref={panel} tabIndex={-1} className="mt-2 scroll-mb-40 rounded-[10px] border border-cyan/20 bg-obsidian p-3.5 outline-none" role="region" aria-label={`Preuve ${selected.ref}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-mono font-medium text-cyan">{selected.ref} · {TOOL_LABELS[selected.tool] ?? selected.tool}</p>
              {campaignOf(selected) && <p className="mt-1 truncate text-sm font-semibold text-white">{campaignOf(selected)?.name}</p>}
            </div>
            <button type="button" onClick={() => setOpen(null)} aria-label="Fermer la preuve" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-white/[0.05] hover:text-white">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
            {summaryOf(selected).map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          {campaignOf(selected) && (
            <Link href={`/dashboard/campaigns/${campaignOf(selected)?.id}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan hover:underline">
              Ouvrir la campagne <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
