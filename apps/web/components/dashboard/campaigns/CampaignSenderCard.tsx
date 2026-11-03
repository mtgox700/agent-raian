'use client'

/**
 * « Envoyer depuis » on the campaign page: change the mailbox or alias of a
 * running campaign. It applies from the next email.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SenderPicker, useSenders, type SenderValue } from './SenderPicker'

export function CampaignSenderCard({ campaignId }: { campaignId: string }) {
  const senders = useSenders(campaignId)
  const [saved, setSaved] = useState<SenderValue | null>(null)
  const [value, setValue] = useState<SenderValue>({ mailboxId: null, fromAlias: null })
  const [saving, setSaving] = useState(false)
  const [senderLost, setSenderLost] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/campaigns/${campaignId}/sender`)
      .then(async (res) => {
        const data = await res.json() as SenderValue & { senderLost?: boolean; error?: string }
        if (cancelled || !res.ok) return
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
      const res = await fetch(`/api/campaigns/${campaignId}/sender`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      const data = await res.json() as SenderValue & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible')
      const next = { mailboxId: data.mailboxId ?? null, fromAlias: data.fromAlias ?? null }
      setSaved(next)
      setValue(next)
      setSenderLost(false)
      toast.success('Expéditeur enregistré : il s’applique dès le prochain e-mail')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-[10px] border border-border bg-obsidian p-4" aria-label="Expéditeur de la campagne">
      {senderLost && (
        <p role="alert" className="mb-3 rounded-md border border-warning/30 px-3 py-2 text-xs leading-relaxed text-warning">
          La boîte d’envoi de cette campagne a été supprimée. Choisissez un expéditeur et enregistrez-le : la campagne ne peut pas repartir avant.
        </p>
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
            {saving ? 'Enregistrement…' : senderLost ? 'Confirmer cet expéditeur' : 'Enregistrer l’expéditeur'}
          </Button>
          {!senderLost && (
            <Button type="button" variant="ghost" size="sm" onClick={() => saved && setValue(saved)} disabled={saving}>
              Annuler
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
