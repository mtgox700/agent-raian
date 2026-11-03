'use client'

/**
 * « Envoyer depuis »: the mailbox, and optionally the alias, a campaign is
 * sent from (mailbox.senders). Shared by alerts, the campaign wizard and the
 * campaign page.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Select } from '@/components/ui'
import { senderCopy as t } from '@/lib/app-copy'
import { api } from '@/lib/front/api'
import type { SenderMailbox } from '@/lib/front/types'

export interface SenderValue { mailboxId: string | null; fromAlias: string | null }

const SEPARATOR = '|'
const encode = (v: SenderValue) => (v.mailboxId ? `${v.mailboxId}${SEPARATOR}${v.fromAlias ?? ''}` : '')
function decode(raw: string): SenderValue {
  if (!raw) return { mailboxId: null, fromAlias: null }
  // Split at the first separator only: an address may itself contain one.
  const at = raw.indexOf(SEPARATOR)
  if (at < 0) return { mailboxId: raw, fromAlias: null }
  return { mailboxId: raw.slice(0, at), fromAlias: raw.slice(at + 1) || null }
}

/** The mailboxes a campaign may send from (its owner's and the shared ones); without a campaign, the current user's. */
export function useSenders(campaignId?: string) {
  const [mailboxes, setMailboxes] = useState<SenderMailbox[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api.call('mailbox.senders', { query: { campaignId } })
      .then((data) => { if (!cancelled) setMailboxes(data.mailboxes) })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof ApiError && err.body?.error ? err.body.error : t.unavailable) })
    return () => { cancelled = true }
  }, [campaignId])
  return { mailboxes, error }
}

export function SenderPicker({ value, onChange, mailboxes, loadError, disabled, id = 'sender-picker' }: {
  value: SenderValue
  onChange: (value: SenderValue) => void
  mailboxes: SenderMailbox[] | null
  loadError?: string | null
  disabled?: boolean
  id?: string
}) {
  if (loadError) return <p role="alert" className="text-xs text-danger">{loadError}</p>
  if (!mailboxes) {
    return <p className="flex items-center gap-2 text-xs text-quiet"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t.loading}</p>
  }
  if (mailboxes.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-quiet">
        {t.none}{' '}
        <Link href={t.connectHref} className="text-accent underline-offset-2 hover:underline">{t.connect}</Link>
      </p>
    )
  }

  const fallback = mailboxes.find((m) => m.isDefault && m.status === 'CONNECTED') ?? mailboxes.find((m) => m.status === 'CONNECTED')
  const selected = mailboxes.find((m) => m.id === value.mailboxId)
  const usesAlias = Boolean(selected && value.fromAlias)

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-1.5 font-mono text-xs text-quiet">
        <Mail className="h-3 w-3" aria-hidden="true" /> {t.label}
      </label>
      <Select id={id} size="sm" value={encode(value)} disabled={disabled} onChange={(e) => onChange(decode(e.target.value))}>
        <option value="">{t.defaultBox(fallback?.email)}</option>
        {mailboxes.map((mailbox) => {
          const off = mailbox.status !== 'CONNECTED'
          return (
            <optgroup key={mailbox.id} label={`${t.provider[mailbox.provider] ?? mailbox.provider} · ${mailbox.email}${off ? t.disconnected : ''}`}>
              <option value={encode({ mailboxId: mailbox.id, fromAlias: null })} disabled={off}>
                {mailbox.displayName ? `${mailbox.displayName} <${mailbox.email}>` : mailbox.email}
              </option>
              {mailbox.aliases.map((alias) => (
                <option key={alias.email} value={encode({ mailboxId: mailbox.id, fromAlias: alias.email })} disabled={off}>
                  {`${t.alias}${alias.displayName ? `${alias.displayName} <${alias.email}>` : alias.email}`}
                </option>
              ))}
            </optgroup>
          )
        })}
      </Select>
      <p className="text-xs leading-relaxed text-quiet">{usesAlias ? t.aliasNote(selected?.email) : t.replyNote}</p>
    </div>
  )
}
