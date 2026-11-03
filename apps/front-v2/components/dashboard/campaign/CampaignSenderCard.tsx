'use client'

/** « Envoyer depuis » on the campaign page (campaigns.getSender / updateSender): applies from the next e-mail. */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@phantera/sdk'
import { Button } from '@/components/ui'
import { SenderPicker, useSenders, type SenderValue } from '@/components/dashboard/shared/SenderPicker'
import { senderCardCopy as t } from '@/lib/copy/campaign'
import { api } from '@/lib/front/api'

export function CampaignSenderCard({ campaignId }: { campaignId: string }) {
  const senders = useSenders(campaignId)
  const [saved, setSaved] = useState<SenderValue | null>(null)
  const [value, setValue] = useState<SenderValue>({ mailboxId: null, fromAlias: null })
  const [saving, setSaving] = useState(false)
  const [senderLost, setSenderLost] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.call('campaigns.getSender', { params: { campaignId } })
      .then((data) => {
        if (cancelled) return
        setSenderLost(Boolean(data.senderLost))
        const current = { mailboxId: data.mailboxId ?? null, fromAlias: data.fromAlias ?? null }
        setSaved(current)
        setValue(current)
      })
      .catch(() => { /* the picker still shows the default */ })
    return () => { cancelled = true }
  }, [campaignId])

  // A removed sender needs an explicit choice, even if it is the default.
  const dirty = saved !== null && (senderLost || saved.mailboxId !== value.mailboxId || saved.fromAlias !== value.fromAlias)

  const save = async () => {
    setSaving(true)
    try {
      const data = await api.call('campaigns.updateSender', { params: { campaignId }, body: value })
      const next = { mailboxId: data.mailboxId ?? null, fromAlias: data.fromAlias ?? null }
      setSaved(next)
      setValue(next)
      setSenderLost(false)
      toast.success(t.saved)
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.body?.error ?? t.failed) : t.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-raised p-4" aria-label={t.label}>
      {senderLost && (
        <p role="alert" className="mb-3 rounded-md border border-warning/30 px-3 py-2 text-xs leading-relaxed text-warning">{t.lost}</p>
      )}
      <SenderPicker
        id={`sender-${campaignId}`}
        value={value}
        onChange={setValue}
        mailboxes={senders.mailboxes}
        loadError={senders.error}
        disabled={saving || saved === null}
      />
      {dirty && (
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => void save()} disabled={saving} aria-busy={saving}>
            {saving ? t.saving : senderLost ? t.confirm : t.save}
          </Button>
          {!senderLost && (
            <Button type="button" variant="ghost" size="sm" onClick={() => saved && setValue(saved)} disabled={saving}>{t.cancel}</Button>
          )}
        </div>
      )}
    </section>
  )
}
