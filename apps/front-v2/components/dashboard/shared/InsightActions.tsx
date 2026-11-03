'use client'

/**
 * An alert's one-click actions: always confirmed in place (what will happen,
 * how to undo it), never automatic. And the recent ones with their effect,
 * stated honestly, and a way back. Ported from body n°1.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, Loader2, MinusCircle, Undo2, XCircle } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Button } from '@/components/ui'
import { SenderPicker, useSenders, type SenderValue } from '@/components/dashboard/shared/SenderPicker'
import { insightsCopy as t } from '@/lib/app-copy'
import { api } from '@/lib/front/api'
import type { InsightOpen, InsightRecentAction } from '@/lib/front/types'

export type OfferedAction = InsightOpen['actions'][number]

/** Null when done, or the message to show. */
async function attempt(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null } catch (err) {
    return err instanceof ApiError && err.body?.error ? err.body.error : t.actionFailed
  }
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

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
    const err = await attempt(() => api.call('insights.act', { params: { id: insightId }, body: { action: action.kind, ...(needsSender ? { sender } : {}) } }))
    setBusy(false)
    if (err) { setError(err); return }
    onDone()
  }

  return (
    <div role="group" aria-label={action.label} className="mt-3 space-y-3 rounded-md border border-accent/25 bg-accent/[0.04] p-3"
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onCancel() }}>
      <p className="text-xs font-semibold text-ink">{action.label} ?</p>
      <p className="text-xs leading-relaxed text-ink/80">{action.confirm}</p>
      {needsSender && (
        <SenderChoice campaignId={campaignId} id={`sender-${insightId}`} value={sender} onChange={setSender} disabled={busy} onReady={setSendersReady} />
      )}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button ref={confirmRef} type="button" size="sm" onClick={() => void confirm()} disabled={busy || (needsSender && !sendersReady)}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />} {t.confirm}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>{t.cancel}</Button>
      </div>
    </div>
  )
}

const STATE = {
  'mesuré':     { Icon: CheckCircle2, tone: 'text-success' },
  'trop tôt':   { Icon: Clock,        tone: 'text-quiet' },
  'sans effet': { Icon: XCircle,      tone: 'text-warning' },
  'annulé':     { Icon: MinusCircle,  tone: 'text-quiet' },
} as const

export function RecentActions({ actions, showCampaign, onChanged }: { actions: InsightRecentAction[]; showCampaign: boolean; onChanged: () => void }) {
  const [undoing, setUndoing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (actions.length === 0) return null

  const undo = async (id: string) => {
    setUndoing(id)
    setError(null)
    const err = await attempt(() => api.call('insights.undoAction', { params: { actionId: id } }))
    setUndoing(null)
    setConfirming(null)
    if (err) { setError(err); return }
    onChanged()
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <h3 className="mb-2 font-mono text-xs text-quiet">{t.recentTitle}</h3>
      {error && <p className="mb-2 text-xs text-danger" role="alert">{error}</p>}
      <ul className="space-y-2">
        {actions.map((a) => {
          const { Icon, tone } = STATE[a.impact.state]
          return (
            <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-xs">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-ink/90">
                  {a.label}
                  {showCampaign && a.campaignId && <>{t.on}<Link href={`/dashboard/campaigns/${a.campaignId}`} className="text-accent hover:underline">« {a.campaignName} »</Link></>}
                  <span className="text-quiet">{t.the(shortDate(a.at))}</span>
                </p>
                <p className={tone}><span className="sr-only">{t.effect}</span>{a.impact.text}</p>
                {a.undoBlocked && <p className="text-quiet">{a.undoBlocked}</p>}
                {a.link && <Link href={a.link.href} className="font-semibold text-accent hover:underline">{a.link.label}</Link>}
              </div>
              {a.undoLabel && (confirming === a.id ? (
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => void undo(a.id)} disabled={undoing === a.id} autoFocus
                    className="flex min-h-[28px] items-center gap-1 rounded-md bg-surface px-2 font-semibold text-ink disabled:opacity-50">
                    {undoing === a.id && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />} {t.confirm}
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="min-h-[28px] px-1 text-quiet hover:text-ink">{t.no}</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(a.id)} className="flex min-h-[28px] items-center gap-1 rounded-md px-1.5 text-quiet hover:text-ink">
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
