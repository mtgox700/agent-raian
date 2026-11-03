'use client'

/**
 * « À envoyer »: WhatsApp/SMS messages drafted by sequence steps. The user
 * goes through them from their phone: each « Ouvrir » opens WhatsApp or the
 * SMS app with the message prefilled (a real <a>, so mobile browsers allow
 * it), the step is recorded as sent (touches.markSent), and the next one
 * comes up. « Passer » skips it (touches.skip).
 */

import { useState } from 'react'
import { MessageCircle, MessageSquareText, Send, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@phantera/sdk'
import { AppPage } from '@/components/app/AppPage'
import { Button, EmptyState, Textarea, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/front/api'
import { formatPhone, smsLink, whatsappLink } from '@/lib/phone/phone'
import { TOUCH_MAX_LENGTH } from '@/lib/touch/channels'
import { INBOX_READ_EVENT } from '@/lib/inbox/events'
import { aEnvoyerCopy as t } from '@/lib/copy/a-envoyer'
import type { QueueItem } from '@/lib/front/types-a-envoyer'

export function PhoneQueue({ initialItems, initialRemaining }: { initialItems: QueueItem[]; initialRemaining: number }) {
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
    api.call('touches.markSent', { params: { touchId: item.id }, body: { body } }, { keepalive: true })
      .then((data) => {
        setRemaining(data.remainingToday ?? remaining)
        setDone((n) => n + 1)
        removeItem(item.id)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          toast.error(err.body?.error ?? t.notRecorded)
          // Already sent or skipped elsewhere: it leaves the queue.
          if (err.status === 409) removeItem(item.id)
          return
        }
        toast.error(t.notRecorded)
      })
  }

  const skip = async (item: QueueItem) => {
    try {
      await api.call('touches.skip', { params: { touchId: item.id } })
      removeItem(item.id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) { removeItem(item.id); return }
      toast.error(err instanceof ApiError ? err.body?.error ?? t.skipFailed : t.skipFailed)
    }
  }

  return (
    <AppPage title={t.title} description={<span className="font-mono tabular-nums">{t.summary(items.length, done, remaining)}</span>}>
      <div className="mx-auto max-w-2xl space-y-5 pb-8">
        <p className="flex gap-3 rounded-lg border border-line bg-raised px-4 py-3 text-sm leading-relaxed text-quiet">
          <Send className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <span>{t.intro}</span>
        </p>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line py-6">
            <EmptyState title={t.emptyTitle}>{t.emptyBody}</EmptyState>
          </div>
        ) : (
          <ul className="space-y-3" aria-label={t.listLabel}>
            {items.map((item) => {
              const channel = item.channel === 'SMS' ? 'SMS' : 'WHATSAPP'
              const body = bodies[item.id] ?? item.body
              const max = TOUCH_MAX_LENGTH[channel]
              const tooLong = body.length > max
              const phone = item.lead.phone
              const name = `${item.lead.firstName} ${item.lead.lastName}`
              const href = phone && body.trim() && !tooLong && remaining > 0
                ? (channel === 'WHATSAPP' ? whatsappLink(phone, body.trim()) : smsLink(phone, body.trim()))
                : undefined
              const counterId = `touch-count-${item.id}`
              return (
                <li key={item.id} className="rounded-lg border border-line bg-raised p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium text-ink">{name}</h2>
                      <p className="truncate text-xs text-quiet">
                        {[item.lead.title, item.lead.company].filter(Boolean).join(' · ') || '-'}
                        {phone && <span className="font-mono tabular-nums">{` · ${formatPhone(phone)}`}</span>}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink">
                      {channel === 'WHATSAPP'
                        ? <MessageCircle className="h-3 w-3 text-quiet" aria-hidden="true" />
                        : <MessageSquareText className="h-3 w-3 text-quiet" aria-hidden="true" />}
                      {channel === 'WHATSAPP' ? t.whatsapp : t.sms}
                    </span>
                  </div>
                  <Textarea
                    value={body}
                    onChange={(e) => setBodies((b) => ({ ...b, [item.id]: e.target.value }))}
                    rows={4}
                    aria-label={t.message(name)}
                    aria-invalid={tooLong}
                    aria-describedby={counterId}
                    className="resize-none text-sm"
                  />
                  <p id={counterId} className={cn('mt-1 text-right font-mono text-[11px] tabular-nums', tooLong ? 'text-danger' : 'text-quiet')}>
                    {body.length}/{max}
                  </p>
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
                        !href && 'cursor-not-allowed bg-surface text-quiet hover:bg-surface',
                      )}
                    >
                      {channel === 'WHATSAPP' ? t.openWhatsapp : t.openSms}
                    </a>
                    <Button type="button" variant="outline" size="sm" onClick={() => void skip(item)}>
                      <SkipForward className="h-4 w-4" aria-hidden="true" /> {t.skip}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AppPage>
  )
}
