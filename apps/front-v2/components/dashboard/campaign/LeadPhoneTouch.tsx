'use client'

/**
 * WhatsApp / SMS from the user's own phone, for one lead: the number
 * (leads.setPhone, or the paid lookup leads.phoneReveal), a drafted message
 * (leads.draftTouch) the user opens in the phone app, the send recorded
 * (leads.recordTouch) and the last ones (leads.listTouches). Nothing leaves
 * on its own.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle, MessageSquareText, Phone, Search } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@phantera/sdk'
import { phoneCopy as t } from '@/lib/copy/campaign'
import { api } from '@/lib/front/api'
import type { PhoneRevealState, SentTouchRow, TouchChannelKey } from '@/lib/front/types-campaigns'
import { formatPhone, normalizePhone, smsLink, whatsappLink } from '@/lib/phone/phone'
import { TOUCH_MAX_LENGTH } from '@/lib/touch/channels'
import { cn } from '@/lib/utils'

export interface PhoneLead { id: string; status: string; phone?: string | null; doNotContact?: boolean }

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? (err.body?.error ?? fallback) : err instanceof Error ? err.message : fallback)

const POLL_MS = 15_000
const MAX_POLLS = 24

/** « Trouver son numéro »: the lookup answers in a few minutes; checked back while the panel is open. */
function PhoneRevealButton({ leadId, onPhoneFound }: { leadId: string; onPhoneFound: (phone: string) => void }) {
  const [state, setState] = useState<PhoneRevealState | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const polls = useRef(0)

  const load = useCallback(async () => {
    try {
      const data = await api.call('leads.phoneRevealState', { params: { leadId } })
      setState(data)
      if (data.phone) onPhoneFound(data.phone)
    } catch { /* the lookup is optional */ }
  }, [leadId, onPhoneFound])

  useEffect(() => { polls.current = 0; void load() }, [load])

  useEffect(() => {
    if (state?.status !== 'PENDING' || state.phone) return
    const timer = setInterval(() => {
      polls.current += 1
      if (polls.current > MAX_POLLS) { clearInterval(timer); return }
      void load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [state?.status, state?.phone, load])

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      const data = await api.call('leads.phoneReveal', { params: { leadId } })
      polls.current = 0
      setState((s) => s && { ...s, status: 'PENDING', remainingMonth: data.remainingMonth ?? s.remainingMonth })
    } catch (err) {
      setError(errorText(err, t.revealFailed))
    } finally {
      setStarting(false)
    }
  }

  if (!state || !state.fromApollo || state.phone) return null
  if (state.status === 'PENDING') {
    return <p className="mt-2 flex items-center gap-2 text-[11px] text-quiet"><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> {t.revealPending}</p>
  }
  if (state.status === 'FOUND') return null
  if (state.status === 'NOT_FOUND') return <p className="mt-2 text-[11px] text-quiet">{t.revealNotFound}</p>
  if (state.remainingMonth === 0) return null

  return (
    <div className="mt-2">
      <button type="button" onClick={() => void start()} disabled={starting}
        className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[11px] font-semibold text-quiet transition-colors duration-200 hover:border-accent/30 hover:text-ink disabled:opacity-50">
        {starting ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
        {t.reveal}
        <span className="font-mono font-normal tabular-nums text-quiet">{t.revealRemaining(state.remainingMonth)}</span>
      </button>
      {error && <p className="mt-1 text-[11px] text-danger" role="alert">{error}</p>}
    </div>
  )
}

export function LeadPhoneTouch<L extends PhoneLead>({ lead, onLeadUpdated }: { lead: L; onLeadUpdated?: (lead: L) => void }) {
  const [phoneInput, setPhoneInput] = useState(lead.phone ? formatPhone(lead.phone) : '')
  const [savingPhone, setSavingPhone] = useState(false)
  const [channel, setChannel] = useState<TouchChannelKey | null>(null)
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [touches, setTouches] = useState<SentTouchRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadTouches = useCallback(async () => {
    try {
      const data = await api.call('leads.listTouches', { params: { leadId: lead.id } })
      setTouches(data.touches ?? [])
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

  const prepare = async (next: TouchChannelKey) => {
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

  // The link opens the phone app on the user's tap (a real <a>, never blocked); the send is recorded alongside.
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
    <div className="mb-5 rounded-lg border border-line p-4">
      <p className="mb-3 font-mono text-xs text-quiet">{t.title}</p>
      <div className="flex items-center gap-2">
        <Phone className="h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
        <input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder={t.phonePh} aria-label={t.phoneLabel}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 font-mono text-xs tabular-nums text-ink placeholder:text-quiet/70 outline-none focus:border-accent/40" />
        {phoneChanged && (
          <button type="button" onClick={() => void savePhone()} disabled={savingPhone || (phoneInput.trim() !== '' && !inputDigits)}
            className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-40">
            {savingPhone ? t.saving : t.save}
          </button>
        )}
      </div>

      {!savedPhone && !lead.doNotContact && <PhoneRevealButton leadId={lead.id} onPhoneFound={onPhoneFound} />}

      {lead.doNotContact ? (
        <p className="mt-3 text-[11px] text-danger">{t.doNotContact}</p>
      ) : savedPhone && !channel ? (
        <div className="mt-3 flex gap-2">
          {(['WHATSAPP', 'SMS'] as const).map((c) => (
            <button key={c} type="button" onClick={() => void prepare(c)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-[11px] font-semibold text-quiet transition-colors duration-200 hover:border-accent/30 hover:text-ink">
              {c === 'WHATSAPP' ? <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> : <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />}
              {t.prepare(t.channel[c])}
            </button>
          ))}
        </div>
      ) : null}

      {channel && (
        <div className="mt-3 space-y-2">
          {drafting ? (
            <p className="flex items-center gap-2 text-[11px] text-quiet" role="status"><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> {t.drafting}</p>
          ) : (
            <>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} aria-label={t.messageLabel(t.channel[channel])}
                className="w-full resize-none rounded-md border border-line bg-canvas px-3 py-2 text-xs leading-relaxed text-ink outline-none focus:border-accent/40" />
              <div className="flex items-center justify-between text-[11px]">
                <span className={cn('font-mono tabular-nums', tooLong ? 'text-danger' : 'text-quiet')}>{draft.length}/{TOUCH_MAX_LENGTH[channel]}</span>
                {remaining !== null && <span className="font-mono tabular-nums text-quiet">{t.remainingToday(remaining)}</span>}
              </div>
              <div className="flex gap-2">
                <a
                  href={href}
                  target={channel === 'WHATSAPP' ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  onClick={(e) => { if (!href) { e.preventDefault(); return } record() }}
                  aria-disabled={!href}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-bold transition-colors duration-200',
                    href ? 'bg-accent text-canvas hover:bg-accent-strong' : 'cursor-not-allowed bg-surface text-quiet',
                  )}
                >
                  {channel === 'WHATSAPP' ? t.openWhatsapp : t.openSms}
                </a>
                <button type="button" onClick={() => { setChannel(null); setDraft('') }} className="rounded-md border border-line px-3 py-2 text-[11px] font-semibold text-quiet transition-colors hover:text-ink">
                  {t.cancel}
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-quiet">{t.note}</p>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-danger" role="alert">{error}</p>}

      {touches.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {touches.slice(0, 3).map((x) => (
            <li key={x.id} className="text-[11px] text-quiet">
              <span className="font-semibold text-ink/80">{t.channel[x.channel]}</span>
              {' · '}
              {new Date(x.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              <span className="block truncate text-quiet">{x.body}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
