'use client'

/**
 * WhatsApp / SMS from the user's own phone, for one lead.
 *
 * The app drafts the message; the user reviews it and taps "Ouvrir WhatsApp"
 * or "Ouvrir les SMS": the phone app opens with the text prefilled and the
 * user sends it. Nothing is sent automatically to a number that did not opt in.
 * Shared by the Leads screen and the campaign page (any row with these fields).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle, MessageSquareText, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Input, Textarea, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/front/api'
import { formatPhone, normalizePhone, smsLink, whatsappLink } from '@/lib/phone/phone'
import { TOUCH_MAX_LENGTH, type TouchChannel } from '@/lib/touch/channels'
import { phoneCopy as t } from '@/lib/copy/leads'
import type { SentTouch } from '@/lib/front/types-leads'
import { PhoneRevealButton } from './PhoneRevealButton'
import { apiErrorMessage as errorText } from './errors'

/** What the panel reads of a lead: a Leads-screen row or a campaign-page row. */
export interface PhoneLead { id: string; status: string; phone?: string | null; doNotContact?: boolean }

export function LeadPhoneTouch<L extends PhoneLead>({ lead, onLeadUpdated }: {
  lead: L
  onLeadUpdated?: (lead: L) => void
}) {
  const [phoneInput, setPhoneInput] = useState(lead.phone ? formatPhone(lead.phone) : '')
  const [savingPhone, setSavingPhone] = useState(false)
  const [channel, setChannel] = useState<TouchChannel | null>(null)
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [touches, setTouches] = useState<SentTouch[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadTouches = useCallback(async () => {
    try {
      const data = await api.call('leads.listTouches', { params: { leadId: lead.id } })
      setTouches(data.touches)
    } catch { /* history is secondary */ }
  }, [lead.id])

  useEffect(() => { void loadTouches() }, [loadTouches])

  const savePhone = async () => {
    setSavingPhone(true)
    setError(null)
    try {
      const data = await api.call('leads.setPhone', { params: { leadId: lead.id }, body: { phone: phoneInput } })
      onLeadUpdated?.({ ...lead, phone: data.phone ?? null })
      toast.success(data.phone ? t.saved : t.removed)
    } catch (err) {
      setError(errorText(err, t.saveFailed))
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
      const data = await api.call('leads.draftTouch', { params: { leadId: lead.id }, body: { channel: next } })
      if (!data.body) throw new Error(t.draftFailed)
      setDraft(data.body)
      setRemaining(data.remainingToday ?? null)
    } catch (err) {
      setChannel(null)
      setError(errorText(err, t.draftFailed))
    } finally {
      setDrafting(false)
    }
  }

  // The link opens the phone app on the user's tap (a real <a>, so mobile
  // browsers do not block it); the send is recorded alongside.
  const record = () => {
    if (!channel) return
    const sent = { channel, body: draft }
    api.call('leads.recordTouch', { params: { leadId: lead.id }, body: sent }, { keepalive: true })
      .then((data) => {
        setRemaining(data.remainingToday ?? null)
        if (lead.status === 'new' || lead.status === 'queued') onLeadUpdated?.({ ...lead, status: 'contacted' })
        toast.success(t.opened(t.channel[sent.channel]))
        setChannel(null)
        setDraft('')
        void loadTouches()
      })
      .catch((err: unknown) => toast.error(errorText(err, t.notRecorded)))
  }

  // Stable for the reveal button (it reloads when this changes): reads the latest lead.
  const latest = useRef({ lead, onLeadUpdated })
  useEffect(() => { latest.current = { lead, onLeadUpdated } }, [lead, onLeadUpdated])
  const onPhoneFound = useCallback((phone: string) => {
    setPhoneInput(formatPhone(phone))
    latest.current.onLeadUpdated?.({ ...latest.current.lead, phone })
  }, [])

  const savedPhone = lead.phone ?? null
  const inputDigits = normalizePhone(phoneInput)
  const phoneChanged = (inputDigits ?? '') !== (savedPhone ?? '') && !(phoneInput.trim() === '' && !savedPhone)
  const tooLong = channel ? draft.length > TOUCH_MAX_LENGTH[channel] : false
  const href = savedPhone && channel && draft.trim() && !tooLong
    ? (channel === 'WHATSAPP' ? whatsappLink(savedPhone, draft.trim()) : smsLink(savedPhone, draft.trim()))
    : undefined

  return (
    <section className="mb-5 rounded-lg border border-line p-4" aria-labelledby={`touch-${lead.id}`}>
      <h3 id={`touch-${lead.id}`} className="mb-3 font-mono text-xs text-quiet">{t.title}</h3>

      <div className="flex items-center gap-2">
        <Phone className="h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
        <Input
          size="sm"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder={t.phonePlaceholder}
          aria-label={t.phoneLabel}
          inputMode="tel"
          className="min-w-0 flex-1 font-mono tabular-nums"
        />
        {phoneChanged && (
          <button
            type="button"
            onClick={() => void savePhone()}
            disabled={savingPhone || (phoneInput.trim() !== '' && !inputDigits)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
          >
            {savingPhone ? t.saving : t.save}
          </button>
        )}
      </div>

      {!savedPhone && !lead.doNotContact && <PhoneRevealButton leadId={lead.id} onPhoneFound={onPhoneFound} />}

      {lead.doNotContact ? (
        <p className="mt-3 text-xs text-danger">{t.doNotContact}</p>
      ) : savedPhone && !channel ? (
        <div className="mt-3 flex gap-2">
          {(['WHATSAPP', 'SMS'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void prepare(c)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1')}
            >
              {c === 'WHATSAPP' ? <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> : <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />}
              {t.prepare(t.channel[c])}
            </button>
          ))}
        </div>
      ) : null}

      {channel && (
        <div className="mt-3 space-y-2">
          {drafting ? (
            <p className="flex items-center gap-2 text-xs text-quiet" role="status">
              <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> {t.drafting}
            </p>
          ) : (
            <>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                aria-label={t.message(t.channel[channel])}
                aria-invalid={tooLong}
                className="text-sm"
              />
              <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                <span className={tooLong ? 'text-danger' : 'text-quiet'}>{draft.length}/{TOUCH_MAX_LENGTH[channel]}</span>
                {remaining !== null && <span className="text-quiet">{t.remaining(remaining)}</span>}
              </div>
              <div className="flex gap-2">
                <a
                  href={href}
                  target={channel === 'WHATSAPP' ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  onClick={(e) => { if (!href) { e.preventDefault(); return } record() }}
                  aria-disabled={!href}
                  className={cn(
                    buttonVariants({ size: 'sm' }),
                    'flex-1',
                    !href && 'cursor-not-allowed bg-surface text-quiet hover:bg-surface',
                  )}
                >
                  {channel === 'WHATSAPP' ? t.openWhatsapp : t.openSms}
                </a>
                <button
                  type="button"
                  onClick={() => { setChannel(null); setDraft('') }}
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  {t.cancel}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-quiet">{t.note}</p>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}

      {touches.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {touches.slice(0, 3).map((touch) => (
            <li key={touch.id} className="text-xs text-quiet">
              <span className="font-medium text-ink">{t.channel[touch.channel]}</span>
              {' · '}
              <span className="font-mono tabular-nums">
                {new Date(touch.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <span className="block truncate">{touch.body}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
