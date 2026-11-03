'use client'

/**
 * An alert's one-click actions: always confirmed in place (what will happen,
 * how to undo it), never automatic. And the recent ones with their effect,
 * stated honestly, and a way back.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, Loader2, MinusCircle, Undo2, XCircle } from 'lucide-react'
import { SenderPicker, useSenders, type SenderValue } from './campaigns/SenderPicker'

export interface OfferedAction { kind: 'pause' | 'change_sender' | 'skip_segment' | 'duplicate'; label: string; confirm: string }

export interface RecentAction {
  id: string
  kind: string
  label: string
  undoLabel: string | null
  /** Why it cannot be undone, when that is the case. */
  undoBlocked: string | null
  campaignId: string | null
  campaignName: string | null
  alert: string
  at: string
  impact: { state: 'mesuré' | 'trop tôt' | 'sans effet' | 'annulé'; text: string }
  link: { href: string; label: string } | null
}

async function post(url: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null)
  if (res?.ok) return null
  const data = await res?.json().catch(() => null) as { error?: string } | null
  return data?.error ?? 'L’action n’a pas pu être faite. Réessayez.'
}

/** The mailbox choice, mounted only for a change of sender: no request otherwise. */
function SenderChoice({ campaignId, id, value, onChange, disabled, onReady }: {
  campaignId: string; id: string; value: SenderValue; onChange: (v: SenderValue) => void; disabled: boolean; onReady: (ready: boolean) => void
}) {
  const senders = useSenders(campaignId)
  useEffect(() => { onReady(Boolean(senders.mailboxes?.length)) }, [senders.mailboxes, onReady])
  return <SenderPicker id={id} value={value} onChange={onChange} mailboxes={senders.mailboxes} loadError={senders.error} disabled={disabled} />
}

export function ActionConfirm({ insightId, campaignId, action, onDone, onCancel }: {
  insightId: string; campaignId: string; action: OfferedAction; onDone: () => void; onCancel: () => void
}) {
  const needsSender = action.kind === 'change_sender'
  const [sender, setSender] = useState<SenderValue>({ mailboxId: null, fromAlias: null })
  const [sendersReady, setSendersReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (!needsSender) confirmRef.current?.focus() }, [needsSender])

  const confirm = async () => {
    setBusy(true)
    setError(null)
    const err = await post(`/api/insights/${insightId}/act`, { action: action.kind, ...(needsSender ? { sender } : {}) })
    setBusy(false)
    if (err) { setError(err); return }
    onDone()
  }

  return (
    <div role="group" aria-label={action.label} className="mt-3 space-y-3 rounded-md border border-cyan/25 bg-cyan/[0.04] p-3"
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onCancel() }}>
      <p className="text-xs font-semibold text-white">{action.label} ?</p>
      <p className="text-xs leading-relaxed text-white/80">{action.confirm}</p>
      {needsSender && (
        <SenderChoice campaignId={campaignId} id={`sender-${insightId}`} value={sender} onChange={setSender} disabled={busy} onReady={setSendersReady} />
      )}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button ref={confirmRef} type="button" onClick={() => void confirm()} disabled={busy || (needsSender && !sendersReady)}
          className="flex min-h-[36px] items-center gap-1.5 rounded-md bg-cyan px-3 text-xs font-bold text-void transition-opacity duration-150 ease-signal disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />} Confirmer
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-[36px] rounded-md px-3 text-xs font-semibold text-muted transition-colors duration-150 ease-signal hover:text-white">Annuler</button>
      </div>
    </div>
  )
}

const STATE = {
  'mesuré':     { Icon: CheckCircle2, tone: 'text-success-fg' },
  'trop tôt':   { Icon: Clock,        tone: 'text-muted' },
  'sans effet': { Icon: XCircle,      tone: 'text-warning' },
  'annulé':     { Icon: MinusCircle,  tone: 'text-muted' },
} as const

export function RecentActions({ actions, showCampaign, onChanged }: { actions: RecentAction[]; showCampaign: boolean; onChanged: () => void }) {
  const [undoing, setUndoing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (actions.length === 0) return null

  const undo = async (id: string) => {
    setUndoing(id)
    setError(null)
    const err = await post(`/api/insights/actions/${id}/undo`)
    setUndoing(null)
    setConfirming(null)
    if (err) { setError(err); return }
    onChanged()
  }

  return (
    <div className="mt-4 border-t border-border/40 pt-3">
      <h3 className="mb-2 font-mono text-xs text-muted">Actions récentes et leur effet</h3>
      {error && <p className="mb-2 text-xs text-danger" role="alert">{error}</p>}
      <ul className="space-y-2">
        {actions.map((a) => {
          const { Icon, tone } = STATE[a.impact.state]
          return (
            <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-xs">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-white/90">
                  {a.label}
                  {showCampaign && a.campaignId && <> sur <Link href={`/dashboard/campaigns/${a.campaignId}`} className="text-cyan hover:underline">« {a.campaignName} »</Link></>}
                  <span className="text-muted"> le {new Date(a.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                </p>
                <p className={tone}><span className="sr-only">Effet : </span>{a.impact.text}</p>
                {a.undoBlocked && <p className="text-muted">{a.undoBlocked}</p>}
                {a.link && <Link href={a.link.href} className="font-semibold text-cyan hover:underline">{a.link.label}</Link>}
              </div>
              {a.undoLabel && (confirming === a.id ? (
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => void undo(a.id)} disabled={undoing === a.id} autoFocus
                    className="flex min-h-[28px] items-center gap-1 rounded-md bg-white/[0.06] px-2 font-semibold text-white disabled:opacity-50">
                    {undoing === a.id && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />} Confirmer
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="min-h-[28px] px-1 text-muted hover:text-white">Non</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(a.id)} className="flex min-h-[28px] items-center gap-1 rounded-md px-1.5 text-muted hover:text-white">
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> {a.undoLabel}
                </button>
              ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
