'use client'

import { useState } from 'react'
import { AlertTriangle, Gauge, PauseCircle } from 'lucide-react'
import { toast } from 'sonner'

/** Daily caps offered to the customer; 50 is the safe default. */
const CAP_OPTIONS = [30, 50, 100, 200, 300, 500] as const
const SAFE_CAP = 50

interface Props {
  workspaceId:     string
  mailboxId:       string
  provider:        'GMAIL' | 'OUTLOOK' | 'SMTP'
  dailyCap:        number
  warmupEnabled:   boolean
  sentLast24h:     number
  sendPausedUntil: string | null
  onSaved:         () => void
}

const PROVIDER_LIMIT_NOTE: Record<Props['provider'], string> = {
  GMAIL:   'Gmail bloque au-delà d’environ 500 e-mails par jour (2 000 avec Google Workspace).',
  OUTLOOK: 'Outlook bloque au-delà d’environ 300 destinataires par jour pour un compte récent.',
  SMTP:    'Votre hébergeur a sa propre limite d’envoi : vérifiez-la avant d’augmenter.',
}

export function MailboxSendingSettings(props: Props) {
  const [cap, setCap] = useState(props.dailyCap)
  const [warmup, setWarmup] = useState(props.warmupEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (next: { dailyCap?: number; warmupEnabled?: boolean }) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/mailbox', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId: props.workspaceId, mailboxId: props.mailboxId, ...next }),
      })
      if (!res.ok) throw new Error('save failed')
      toast.success(next.dailyCap !== undefined
        ? `Plafond enregistré : ${next.dailyCap} e-mails par jour`
        : next.warmupEnabled ? 'Montée progressive activée' : 'Montée progressive désactivée')
      props.onSaved()
    } catch {
      setError('Réglage non enregistré, réessayez.')
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
  const options = CAP_OPTIONS.includes(cap as (typeof CAP_OPTIONS)[number])
    ? CAP_OPTIONS
    : [...CAP_OPTIONS, cap].sort((a, b) => a - b)

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-obsidian p-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted">
          <Gauge className="h-3 w-3 text-cyan" aria-hidden="true" />
          <span className="text-white">{props.sentLast24h}</span> / {cap} envoyés sur 24 h
        </span>
        <div className="h-1 min-w-[80px] flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div
            className="h-full w-full origin-left rounded-full bg-cyan"
            style={{ transform: `scaleX(${cap > 0 ? used / cap : 0})` }}
          />
        </div>
        <label className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
          Plafond par jour
          <select
            value={cap}
            disabled={saving}
            onChange={(e) => { const v = Number(e.target.value); setCap(v); void save({ dailyCap: v }) }}
            className="rounded-md border border-border bg-void px-1.5 py-0.5 text-[11px] tabular-nums text-white focus:border-cyan/60 focus:outline-none disabled:opacity-50"
          >
            {options.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted" title="Commence à 5 e-mails par jour puis augmente sur 3 semaines : recommandé pour une adresse neuve.">
          <input
            type="checkbox"
            checked={warmup}
            disabled={saving}
            onChange={(e) => { setWarmup(e.target.checked); void save({ warmupEnabled: e.target.checked }) }}
            className="accent-cyan"
          />
          Montée progressive
        </label>
      </div>

      {paused && (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <PauseCircle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
          Votre fournisseur a demandé une pause : reprise automatique à{' '}
          {paused.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. Aucun e-mail n’est perdu.
        </p>
      )}

      {cap > SAFE_CAP && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-warning" aria-hidden="true" />
          <span>
            Au-delà de {SAFE_CAP} e-mails de prospection par jour, le risque d’arriver en spam augmente, surtout pour une
            adresse récente. {PROVIDER_LIMIT_NOTE[props.provider]}
          </span>
        </p>
      )}

      {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
    </div>
  )
}
