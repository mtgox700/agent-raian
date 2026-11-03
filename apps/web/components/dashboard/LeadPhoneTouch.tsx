'use client'

/**
 * WhatsApp / SMS from the user's own phone, for one lead.
 *
 * Phantera drafts the message; the user reviews it and taps "Ouvrir
 * WhatsApp" or "Ouvrir les SMS": the phone app opens with the text
 * prefilled and the user sends it. Nothing is sent automatically to a number
 * that did not opt in (WhatsApp bans accounts that do, and SMS prospecting
 * to a person needs their consent).
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageCircle, MessageSquareText, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatPhone, normalizePhone, smsLink, whatsappLink } from '@/lib/phone/phone'
import { TOUCH_MAX_LENGTH, type TouchChannel } from '@/lib/touch/channels'
import type { LeadWithEnrichment } from '@/lib/types/lead'
import { PhoneRevealButton } from '@/components/dashboard/PhoneRevealButton'

interface Touch {
  id: string
  channel: TouchChannel
  body: string
  createdAt: string
}

const CHANNEL_LABEL: Record<TouchChannel, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS' }

export function LeadPhoneTouch({ lead, onLeadUpdated }: {
  lead: LeadWithEnrichment
  onLeadUpdated?: (lead: LeadWithEnrichment) => void
}) {
  const [phoneInput, setPhoneInput] = useState(lead.phone ? formatPhone(lead.phone) : '')
  const [savingPhone, setSavingPhone] = useState(false)
  const [channel, setChannel] = useState<TouchChannel | null>(null)
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [touches, setTouches] = useState<Touch[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadTouches = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${lead.id}/touch`)
      const data = await res.json() as { touches?: Touch[] }
      if (res.ok) setTouches(data.touches ?? [])
    } catch { /* history is secondary */ }
  }, [lead.id])

  useEffect(() => { void loadTouches() }, [loadTouches])

  const savePhone = async () => {
    setSavingPhone(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/phone`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phoneInput }),
      })
      const data = await res.json() as { phone?: string | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible')
      onLeadUpdated?.({ ...lead, phone: data.phone ?? null })
      toast.success(data.phone ? 'Numéro enregistré' : 'Numéro retiré')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setSavingPhone(false)
    }
  }

  const prepare = async (next: TouchChannel) => {
    setChannel(next)
    setDraft('')
    setDrafting(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/touch/draft`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: next }),
      })
      const data = await res.json() as { body?: string; remainingToday?: number; error?: string }
      if (!res.ok || !data.body) throw new Error(data.error ?? 'Rédaction impossible')
      setDraft(data.body)
      setRemaining(data.remainingToday ?? null)
    } catch (err) {
      setChannel(null)
      setError(err instanceof Error ? err.message : 'Rédaction impossible')
    } finally {
      setDrafting(false)
    }
  }

  // The link opens the phone app on the user's tap (a real <a>, so mobile
  // browsers do not block it); the send is recorded alongside.
  const record = () => {
    if (!channel) return
    const sent = { channel, body: draft }
    void fetch(`/api/leads/${lead.id}/touch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent), keepalive: true,
    })
      .then(async (res) => {
        const data = await res.json() as { remainingToday?: number; error?: string }
        if (!res.ok) { toast.error(data.error ?? 'Envoi non enregistré'); return }
        setRemaining(data.remainingToday ?? null)
        if (lead.status === 'new' || lead.status === 'queued') onLeadUpdated?.({ ...lead, status: 'contacted' })
        toast.success(`${CHANNEL_LABEL[sent.channel]} ouvert : envoyez le message depuis votre téléphone`)
        setChannel(null)
        setDraft('')
        void loadTouches()
      })
      .catch(() => toast.error('Envoi non enregistré'))
  }

  const onPhoneFound = useCallback((phone: string) => {
    setPhoneInput(formatPhone(phone))
    onLeadUpdated?.({ ...lead, phone })
  }, [lead, onLeadUpdated])

  const savedPhone = lead.phone ?? null
  const inputDigits = normalizePhone(phoneInput)
  const phoneChanged = (inputDigits ?? '') !== (savedPhone ?? '') && !(phoneInput.trim() === '' && !savedPhone)
  const tooLong = channel ? draft.length > TOUCH_MAX_LENGTH[channel] : false
  const href = savedPhone && channel && draft.trim() && !tooLong
    ? (channel === 'WHATSAPP' ? whatsappLink(savedPhone, draft.trim()) : smsLink(savedPhone, draft.trim()))
    : undefined

  return (
    <div className="mb-5 rounded-[10px] border border-border p-4">
      <p className="mb-3 font-mono text-xs text-muted">WhatsApp &amp; SMS</p>

      <div className="flex items-center gap-2">
        <Phone className="h-3.5 w-3.5 flex-shrink-0 text-muted" aria-hidden="true" />
        <input
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="+33 6 12 34 56 78"
          aria-label="Numéro professionnel du lead"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-obsidian px-2 font-mono text-xs tabular-nums text-white placeholder:text-muted/70 outline-none focus:border-cyan/40"
        />
        {phoneChanged && (
          <button
            type="button"
            onClick={() => void savePhone()}
            disabled={savingPhone || (phoneInput.trim() !== '' && !inputDigits)}
            className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-1.5 text-[11px] font-semibold text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-40"
          >
            {savingPhone ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
      </div>

      {!savedPhone && !lead.doNotContact && <PhoneRevealButton leadId={lead.id} onPhoneFound={onPhoneFound} />}

      {lead.doNotContact ? (
        <p className="mt-3 text-[11px] text-danger">Ce lead ne doit plus être contacté.</p>
      ) : savedPhone && !channel ? (
        <div className="mt-3 flex gap-2">
          {(['WHATSAPP', 'SMS'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void prepare(c)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-[11px] font-semibold text-muted transition-colors duration-150 hover:border-cyan/30 hover:text-white"
            >
              {c === 'WHATSAPP' ? <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> : <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />}
              Préparer un {CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>
      ) : null}

      {channel && (
        <div className="mt-3 space-y-2">
          {drafting ? (
            <p className="flex items-center gap-2 text-[11px] text-muted" role="status"><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Rédaction du message…</p>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                aria-label={`Message ${CHANNEL_LABEL[channel]}`}
                className="w-full resize-none rounded-md border border-border bg-obsidian px-3 py-2 text-xs leading-relaxed text-white outline-none focus:border-cyan/40"
              />
              <div className="flex items-center justify-between text-[11px]">
                <span className={cn('font-mono tabular-nums', tooLong ? 'text-danger' : 'text-muted')}>{draft.length}/{TOUCH_MAX_LENGTH[channel]}</span>
                {remaining !== null && <span className="font-mono tabular-nums text-muted">{remaining} envoi{remaining > 1 ? 's' : ''} restant{remaining > 1 ? 's' : ''} aujourd&apos;hui</span>}
              </div>
              <div className="flex gap-2">
                <a
                  href={href}
                  target={channel === 'WHATSAPP' ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  onClick={(e) => { if (!href) { e.preventDefault(); return } record() }}
                  aria-disabled={!href}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-bold transition-colors duration-150',
                    href ? 'bg-cyan text-void hover:bg-cyan-300' : 'cursor-not-allowed bg-white/5 text-muted',
                  )}
                >
                  {channel === 'WHATSAPP' ? 'Ouvrir WhatsApp' : 'Ouvrir les SMS'}
                </a>
                <button
                  type="button"
                  onClick={() => { setChannel(null); setDraft('') }}
                  className="rounded-md border border-border px-3 py-2 text-[11px] font-semibold text-muted transition-colors hover:text-white"
                >
                  Annuler
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                Le message s&apos;ouvre sur votre téléphone : c&apos;est vous qui l&apos;envoyez. Si le prospect répond STOP,
                cochez « Ne plus contacter ».
              </p>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-danger" role="alert">{error}</p>}

      {touches.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {touches.slice(0, 3).map((t) => (
            <li key={t.id} className="text-[11px] text-muted">
              <span className="font-semibold text-white/80">{CHANNEL_LABEL[t.channel]}</span>
              {' · '}
              {new Date(t.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              <span className="block truncate text-muted">{t.body}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
