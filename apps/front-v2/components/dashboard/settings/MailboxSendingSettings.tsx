'use client'

import { useId, useState } from 'react'
import { AlertTriangle, Gauge, PauseCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Select } from '@/components/ui'
import { sendingCopy as t } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import type { MailboxProvider } from '@/lib/front/types-settings'

/** Daily cap and warm-up of one mailbox (mailbox.update). */
export function MailboxSendingSettings(props: {
  workspaceId: string
  mailboxId: string
  provider: MailboxProvider
  dailyCap: number
  warmupEnabled: boolean
  sentLast24h: number
  sendPausedUntil: string | null
  onSaved: () => void
}) {
  const id = useId()
  const [cap, setCap] = useState(props.dailyCap)
  const [warmup, setWarmup] = useState(props.warmupEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (next: { dailyCap?: number; warmupEnabled?: boolean }) => {
    setSaving(true)
    setError(null)
    try {
      await api.call('mailbox.update', { body: { workspaceId: props.workspaceId, mailboxId: props.mailboxId, ...next } })
      toast.success(next.dailyCap !== undefined ? t.capSaved(next.dailyCap) : next.warmupEnabled ? t.warmupOn : t.warmupOff)
      props.onSaved()
    } catch {
      setError(t.failed)
      setCap(props.dailyCap)
      setWarmup(props.warmupEnabled)
    } finally {
      setSaving(false)
    }
  }

  const paused = props.sendPausedUntil && new Date(props.sendPausedUntil).getTime() > Date.now()
    ? new Date(props.sendPausedUntil)
    : null
  const used = Math.min(props.sentLast24h, cap)
  const options: number[] = (t.capOptions as readonly number[]).includes(cap)
    ? [...t.capOptions]
    : [...t.capOptions, cap].sort((a, b) => a - b)

  return (
    <div className="mt-3 space-y-2 rounded-md border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-quiet">
          <Gauge className="h-3 w-3 text-accent" aria-hidden="true" />
          <span className="text-ink">{props.sentLast24h}</span> / {cap} {t.sent}
        </span>
        <div className="h-1 min-w-[80px] flex-1 overflow-hidden rounded-full bg-surface" aria-hidden="true">
          <div className="h-full w-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${cap > 0 ? used / cap : 0})` }} />
        </div>
        <span className="inline-flex items-center gap-2">
          <label htmlFor={`${id}-cap`} className="font-mono text-[11px] text-quiet">{t.cap}</label>
          <Select
            id={`${id}-cap`}
            size="sm"
            value={cap}
            disabled={saving}
            onChange={(e) => { const v = Number(e.target.value); setCap(v); void save({ dailyCap: v }) }}
            wrapperClassName="w-24"
            className="h-8 font-mono text-xs tabular-nums"
          >
            {options.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-quiet" title={t.warmupTitle}>
          <input
            type="checkbox"
            checked={warmup}
            disabled={saving}
            onChange={(e) => { setWarmup(e.target.checked); void save({ warmupEnabled: e.target.checked }) }}
            className="h-4 w-4 accent-[rgb(var(--c-cyan))]"
          />
          {t.warmup}
        </label>
      </div>

      {paused && (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <PauseCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {t.paused(paused.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}
        </p>
      )}

      {cap > t.safeCap && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-quiet">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
          <span>{t.risky(t.safeCap)} {t.providerLimit[props.provider]}</span>
        </p>
      )}

      {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
    </div>
  )
}
