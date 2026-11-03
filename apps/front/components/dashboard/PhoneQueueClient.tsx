'use client'

/**
 * "À envoyer" : WhatsApp/SMS messages drafted by sequence steps. The user
 * goes through them from their phone: each "Ouvrir" opens WhatsApp or the SMS
 * app with the message prefilled (a real <a>, so mobile browsers allow it),
 * the step is recorded as sent, and the next message comes up.
 */

import { useState } from 'react'
import { MessageCircle, MessageSquareText, Send, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { formatPhone, smsLink, whatsappLink } from '@/lib/phone/phone'
import { TOUCH_MAX_LENGTH, type TouchChannel } from '@/lib/touch/channels'
import { INBOX_READ_EVENT } from '@/lib/inbox/events'

export interface QueueItem {
  id: string
  channel: string
  body: string
  createdAt: string
  lead: { id: string; firstName: string; lastName: string; company: string | null; title: string | null; phone: string | null }
}

export function PhoneQueueClient({ initialItems, initialRemaining }: { initialItems: QueueItem[]; initialRemaining: number }) {
  const [items, setItems] = useState(initialItems)
  const [bodies, setBodies] = useState<Record<string, string>>(() => Object.fromEntries(initialItems.map((i) => [i.id, i.body])))
  const [remaining, setRemaining] = useState(initialRemaining)
  const [done, setDone] = useState(0)

  const removeItem = (id: string) => {
    setItems((current) => current.filter((i) => i.id !== id))
    // Same refresh signal as the inbox: the sidebar recounts its badges.
    window.dispatchEvent(new Event(INBOX_READ_EVENT))
  }

  const recordSent = (item: QueueItem) => {
    const body = (bodies[item.id] ?? item.body).trim()
    void fetch(`/api/touches/${item.id}/sent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }), keepalive: true,
    })
      .then(async (res) => {
        const data = await res.json() as { remainingToday?: number; error?: string }
        if (!res.ok) { toast.error(data.error ?? 'Envoi non enregistré'); if (res.status === 409) removeItem(item.id); return }
        setRemaining(data.remainingToday ?? remaining)
        setDone((n) => n + 1)
        removeItem(item.id)
      })
      .catch(() => toast.error('Envoi non enregistré'))
  }

  const skip = async (item: QueueItem) => {
    try {
      const res = await fetch(`/api/touches/${item.id}/skip`, { method: 'POST' })
      const data = await res.json() as { error?: string }
      if (!res.ok && res.status !== 409) throw new Error(data.error ?? 'Impossible de passer ce message')
      removeItem(item.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de passer ce message')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-obsidian">
          <Send className="h-4 w-4 text-cyan" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-white">À envoyer</h1>
          <p className="font-mono text-xs tabular-nums text-muted">
            {[
              `${items.length} message${items.length > 1 ? 's' : ''} WhatsApp / SMS`,
              done > 0 ? `${done} envoyé${done > 1 ? 's' : ''}` : null,
              `${remaining} restant${remaining > 1 ? 's' : ''} aujourd’hui`,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <p className="rounded-[10px] border border-border bg-obsidian px-4 py-3 text-xs leading-relaxed text-muted">
        Ouvrez cette page sur votre téléphone. Chaque bouton ouvre WhatsApp ou vos SMS avec le message prêt :
        vous l&apos;envoyez, la séquence continue. Les SMS partent seuls si votre compte Brevo est connecté
        (Paramètres, onglet E-mails et canaux) ; les WhatsApp passent toujours par vous.
      </p>

      {items.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border py-14 text-center">
          <p className="text-sm font-semibold text-white">Rien à envoyer pour l&apos;instant</p>
          <p className="mt-1 text-xs text-muted">Les étapes WhatsApp et SMS de vos campagnes arrivent ici le jour prévu.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const channel = (item.channel === 'SMS' ? 'SMS' : 'WHATSAPP') as TouchChannel
            const body = bodies[item.id] ?? item.body
            const tooLong = body.length > TOUCH_MAX_LENGTH[channel]
            const phone = item.lead.phone
            const href = phone && body.trim() && !tooLong && remaining > 0
              ? (channel === 'WHATSAPP' ? whatsappLink(phone, body.trim()) : smsLink(phone, body.trim()))
              : undefined
            return (
              <li key={item.id} className="rounded-[10px] border border-border bg-obsidian p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{item.lead.firstName} {item.lead.lastName}</p>
                    <p className="truncate text-xs text-muted">
                      {[item.lead.title, item.lead.company].filter(Boolean).join(' · ') || '-'}
                      {phone && ` · ${formatPhone(phone)}`}
                    </p>
                  </div>
                  <span className="flex flex-shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-white">
                    {channel === 'WHATSAPP'
                      ? <MessageCircle className="h-3 w-3 text-muted" aria-hidden="true" />
                      : <MessageSquareText className="h-3 w-3 text-muted" aria-hidden="true" />}
                    {channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}
                  </span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBodies((b) => ({ ...b, [item.id]: e.target.value }))}
                  rows={4}
                  aria-label={`Message pour ${item.lead.firstName} ${item.lead.lastName}`}
                  className="w-full resize-none rounded-md border border-border bg-void px-3 py-2 text-xs leading-relaxed text-white outline-none focus:border-cyan/60"
                />
                <div className="mt-1 text-right font-mono text-[11px] tabular-nums">
                  <span className={tooLong ? 'text-danger' : 'text-muted'}>{body.length}/{TOUCH_MAX_LENGTH[channel]}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <a
                    href={href}
                    target={channel === 'WHATSAPP' ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    aria-disabled={!href}
                    onClick={(e) => { if (!href) { e.preventDefault(); return } recordSent(item) }}
                    className={cn(
                      buttonVariants({ size: 'sm' }),
                      'flex-1',
                      !href && 'cursor-not-allowed bg-surface text-muted hover:bg-surface',
                    )}
                  >
                    {channel === 'WHATSAPP' ? 'Ouvrir WhatsApp' : 'Ouvrir les SMS'}
                  </a>
                  <Button type="button" variant="outline" size="sm" onClick={() => void skip(item)}>
                    <SkipForward className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Passer
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
