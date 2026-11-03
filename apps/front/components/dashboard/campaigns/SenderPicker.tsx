'use client'

/**
 * « Envoyer depuis »: the mailbox, and optionally the alias, a campaign is
 * sent from. Used in the campaign wizard and on the campaign page.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'

export interface SenderAlias {
  email: string
  displayName: string | null
}

export interface SenderMailbox {
  id: string
  provider: 'GMAIL' | 'OUTLOOK' | 'SMTP'
  email: string
  displayName: string | null
  status: string
  isDefault: boolean
  aliasesSupported: boolean
  aliases: SenderAlias[]
}

export interface SenderValue {
  mailboxId: string | null
  fromAlias: string | null
}

const PROVIDER_LABEL: Record<SenderMailbox['provider'], string> = { GMAIL: 'Gmail', OUTLOOK: 'Outlook', SMTP: 'SMTP' }
const SEPARATOR = '|'

function encode(value: SenderValue): string {
  return value.mailboxId ? `${value.mailboxId}${SEPARATOR}${value.fromAlias ?? ''}` : ''
}

function decode(raw: string): SenderValue {
  if (!raw) return { mailboxId: null, fromAlias: null }
  // Split at the first separator only: an address may itself contain one.
  const at = raw.indexOf(SEPARATOR)
  if (at < 0) return { mailboxId: raw, fromAlias: null }
  return { mailboxId: raw.slice(0, at), fromAlias: raw.slice(at + 1) || null }
}

/**
 * The mailboxes a campaign may send from: those serving its owner (theirs and
 * the shared ones). Without a campaign, the ones serving the current user.
 */
export function useSenders(campaignId?: string) {
  const [mailboxes, setMailboxes] = useState<SenderMailbox[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(campaignId ? `/api/mailbox/senders?campaignId=${encodeURIComponent(campaignId)}` : '/api/mailbox/senders')
      .then(async (res) => {
        const data = await res.json() as { mailboxes?: SenderMailbox[]; error?: string }
        if (cancelled) return
        if (!res.ok) throw new Error(data.error ?? 'Boîtes indisponibles')
        setMailboxes(data.mailboxes ?? [])
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Boîtes indisponibles') })
    return () => { cancelled = true }
  }, [campaignId])

  return { mailboxes, error }
}

interface SenderPickerProps {
  value: SenderValue
  onChange: (value: SenderValue) => void
  mailboxes: SenderMailbox[] | null
  loadError?: string | null
  disabled?: boolean
  id?: string
}

export function SenderPicker({ value, onChange, mailboxes, loadError, disabled, id = 'sender-picker' }: SenderPickerProps) {
  if (loadError) return <p role="alert" className="text-xs text-danger">{loadError}</p>
  if (!mailboxes) {
    return <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Chargement des boîtes…</p>
  }
  if (mailboxes.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-muted">
        Aucune boîte connectée : les e-mails partiront du domaine partagé de Phantera.{' '}
        <Link href="/dashboard/settings?tab=mailboxes" className="text-cyan underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan rounded-sm">Connecter une boîte</Link>
      </p>
    )
  }

  const fallback = mailboxes.find((m) => m.isDefault && m.status === 'CONNECTED') ?? mailboxes.find((m) => m.status === 'CONNECTED')
  const selected = mailboxes.find((m) => m.id === value.mailboxId)
  const usesAlias = Boolean(selected && value.fromAlias)

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-1.5 font-mono text-xs text-muted">
        <Mail className="h-3 w-3" aria-hidden="true" /> Envoyer depuis
      </label>
      <select
        id={id}
        value={encode(value)}
        disabled={disabled}
        onChange={(e) => onChange(decode(e.target.value))}
        className="h-10 w-full rounded-md border border-border bg-void px-3 text-sm text-white outline-none transition-colors duration-150 ease-signal focus:border-cyan/60 focus-visible:ring-2 focus-visible:ring-cyan/40 disabled:opacity-50"
      >
        <option value="">
          {fallback ? `Boîte par défaut (${fallback.email})` : 'Boîte par défaut'}
        </option>
        {mailboxes.map((mailbox) => {
          const off = mailbox.status !== 'CONNECTED'
          return (
            <optgroup key={mailbox.id} label={`${PROVIDER_LABEL[mailbox.provider]} · ${mailbox.email}${off ? ' (déconnectée)' : ''}`}>
              <option value={encode({ mailboxId: mailbox.id, fromAlias: null })} disabled={off}>
                {mailbox.displayName ? `${mailbox.displayName} <${mailbox.email}>` : mailbox.email}
              </option>
              {mailbox.aliases.map((alias) => (
                <option key={alias.email} value={encode({ mailboxId: mailbox.id, fromAlias: alias.email })} disabled={off}>
                  {`Alias : ${alias.displayName ? `${alias.displayName} <${alias.email}>` : alias.email}`}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
      <p className="text-xs leading-relaxed text-muted">
        {usesAlias
          ? `L’alias partage le plafond quotidien et la réputation de ${selected?.email} ; les réponses arrivent dans cette boîte.`
          : 'Les réponses arrivent dans la boîte choisie, où Phantera les lit et arrête la séquence.'}
      </p>
    </div>
  )
}
