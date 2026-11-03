'use client'

/**
 * An Analyst answer, rendered from its sections. Never raw HTML: every line
 * is text, **bold** spans and [T3] citations become elements. Each citation
 * opens the evidence it points to, with a link to the campaign.
 */

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, ShieldCheck, X } from 'lucide-react'
import { analystCopy } from '@/lib/copy/analyst'
import type { Evidence } from '@/lib/front/types-analyst'

const t = analystCopy.answer

function campaignOf(e: Evidence): { id: string; name: string } | null {
  const d = e.data as { campaignId?: string; name?: string; campaign?: { id?: string; name?: string } } | null
  const id = d?.campaignId ?? d?.campaign?.id
  const name = d?.name ?? d?.campaign?.name
  return id ? { id, name: name ?? t.campaign } : null
}

function summaryOf(e: Evidence): string[] {
  const d = e.data as Record<string, unknown> | null
  if (!d) return []
  if (Array.isArray(d.diagnoses)) {
    const list = d.diagnoses as Array<{ title: string; evidence: string[] }>
    return list.length ? list.map((x) => `${x.title} : ${x.evidence.join(', ')}`) : [t.noProblem]
  }
  if (Array.isArray(d.campaigns)) return [t.campaignsRead(d.campaigns.length)]
  if (Array.isArray(d.comparisons)) {
    return (d.comparisons as Array<{ a: { label: string }; b: { label: string }; verdict: string }>).map((c) => t.versus(c.a.label, c.b.label, c.verdict))
  }
  if (Array.isArray(d.segments)) return [t.segments(d.segments.length)]
  return []
}

function Inline({ text, onCite, evidenceRefs }: { text: string; onCite: (ref: string) => void; evidenceRefs: Set<string> }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[T\d+\])/g).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
        const ref = /^\[(T\d+)\]$/.exec(part)?.[1]
        if (ref) {
          return (
            <button
              key={i}
              type="button"
              disabled={!evidenceRefs.has(ref)}
              onClick={() => onCite(ref)}
              aria-label={t.cite(ref)}
              className="mx-0.5 inline-flex min-h-[22px] items-center rounded-md border border-accent/30 bg-accent/10 px-1.5 align-baseline font-mono text-[11px] font-medium text-accent transition-colors duration-200 ease-signal hover:border-accent/60 hover:bg-accent/15 disabled:opacity-50"
            >
              {ref}
            </button>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

const HEADING = /^\s*(?:#+\s*)?\*\*([^*]+)\*\*\s*:?\s*(.*)$/

export function AnswerView({ text, status, evidence }: { text: string; status?: string | null; evidence?: Evidence[] | null }) {
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
      <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/[0.06] p-4" role="status">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-ink/85">{text}</p>
      </div>
    )
  }

  const campaign = selected ? campaignOf(selected) : null
  return (
    <div className="space-y-1">
      <div className="space-y-1.5 text-sm leading-relaxed text-ink/85">
        {text.split('\n').map((line, i) => {
          if (!line.trim()) return null
          const h = HEADING.exec(line)
          if (h) {
            return (
              <div key={i} className={i > 0 ? 'pt-3' : ''}>
                <p className="font-mono text-[11px] text-accent">{h[1]}</p>
                {h[2] && <p className="mt-1 text-[15px] font-medium text-ink"><Inline text={h[2]} onCite={setOpen} evidenceRefs={refs} /></p>}
              </div>
            )
          }
          const bullet = /^\s*[-•]\s+(.*)$/.exec(line)
          if (bullet) {
            return (
              <p key={i} className="flex gap-2 pl-1">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-quiet" aria-hidden="true" />
                <span><Inline text={bullet[1]} onCite={setOpen} evidenceRefs={refs} /></span>
              </p>
            )
          }
          const num = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
          if (num) {
            return (
              <p key={i} className="flex gap-2.5 pl-1">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/40 font-mono text-[11px] font-medium tabular-nums text-accent">{num[1]}</span>
                <span><Inline text={num[2]} onCite={setOpen} evidenceRefs={refs} /></span>
              </p>
            )
          }
          return <p key={i}><Inline text={line} onCite={setOpen} evidenceRefs={refs} /></p>
        })}
      </div>

      <p className="flex items-center gap-1.5 pt-3 text-[11px] text-quiet">
        <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        {t.verified}
      </p>

      {selected && (
        <div ref={panel} tabIndex={-1} className="mt-2 scroll-mb-40 rounded-lg border border-accent/30 bg-surface p-3.5 outline-none" role="region" aria-label={t.evidence(selected.ref)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-accent">{selected.ref} · {t.tools[selected.tool] ?? selected.tool}</p>
              {campaign && <p className="mt-1 truncate text-sm font-medium text-ink">{campaign.name}</p>}
            </div>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label={t.closeEvidence}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-raised hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-quiet">
            {summaryOf(selected).map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          {campaign && (
            <Link href={`/dashboard/campaigns/${campaign.id}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
              {t.openCampaign} <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
