'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Clock, PauseCircle, Send } from 'lucide-react'
import type { SendHold, SendStatus } from '@/lib/sequences/send-status'

const POLL_MS = 30_000

function at(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === new Date().toDateString()) return `vers ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `demain vers ${time}`
  return `le ${d.toLocaleDateString('fr-FR', { weekday: 'long' })} vers ${time}`
}

function holdMessage(s: SendStatus): { text: string; action?: { label: string; href: string } } {
  const resume = s.resumesAt ? `, reprise automatique ${at(s.resumesAt)}` : ''
  const messages: Record<SendHold, { text: string; action?: { label: string; href: string } }> = {
    MAILBOX_CAP: {
      text: `Plafond quotidien de la boîte atteint (${s.sentLast24h}/${s.dailyLimit} sur 24 h)${resume}.`,
      action: { label: 'Augmenter le plafond', href: '/dashboard/settings?tab=mailboxes' },
    },
    SHARED_CAP: { text: `Plafond quotidien de l'adresse Phantera atteint (${s.sentLast24h}/${s.dailyLimit} sur 24 h)${resume}. Connectez votre boîte pour envoyer davantage.`, action: { label: 'Connecter une boîte', href: '/dashboard/settings?tab=mailboxes' } },
    MAILBOX_PAUSED: { text: `Votre fournisseur e-mail a demandé une pause${resume}. Aucun message n'est perdu.` },
    QUOTA: {
      text: `Quota mensuel du forfait atteint (${s.quota.current}/${s.quota.limit ?? '∞'} envois ce mois-ci).`,
      action: { label: 'Changer de forfait', href: '/dashboard/settings?tab=billing' },
    },
    MAILBOX_DISCONNECTED: { text: 'Votre boîte e-mail est déconnectée : les envois attendent sa reconnexion.', action: { label: 'Reconnecter', href: '/dashboard/settings?tab=mailboxes' } },
    NO_SENDER: { text: 'Aucune boîte d’envoi pour cette campagne : les envois attendent que son responsable connecte sa boîte, ou qu’un admin en partage une.', action: { label: 'Connecter une boîte', href: '/dashboard/settings?tab=mailboxes' } },
    CAMPAIGN_PAUSED: { text: 'Campagne en pause : les messages en file partiront à sa réactivation.' },
  }
  return s.hold ? messages[s.hold] : { text: '' }
}

export function SendStatusBanner({ campaignId, initialQueued }: { campaignId: string; initialQueued: number }) {
  const [status, setStatus] = useState<SendStatus | null>(null)

  useEffect(() => {
    if (initialQueued === 0) return
    let stopped = false
    const load = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/send-status`, { cache: 'no-store' })
        if (!res.ok) return
        const next = (await res.json()) as SendStatus
        if (stopped) return
        setStatus(next)
        if (next.queued === 0) stopped = true
      } catch {
        // The banner is informative only: keep the last known status.
      }
    }
    void load()
    const timer = setInterval(() => { if (!stopped) void load() }, POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [campaignId, initialQueued])

  if (!status || status.queued === 0) return null

  if (!status.hold) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-[10px] border border-cyan/25 bg-obsidian px-4 py-3 text-sm text-white/80">
        <Send className="h-3.5 w-3.5 flex-shrink-0 text-cyan" aria-hidden="true" />
        {`${status.queued} message${status.queued > 1 ? 's' : ''} en cours d'envoi${status.sender ? ` depuis ${status.sender}` : ''}, un à la fois (${status.sentLast24h}/${status.dailyLimit} envoyés sur 24 h).`}
      </div>
    )
  }

  const { text, action } = holdMessage(status)
  const Icon = status.hold === 'MAILBOX_CAP' || status.hold === 'SHARED_CAP' ? Clock : PauseCircle
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-warning/30 bg-obsidian px-4 py-3 text-sm text-white/80">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-warning" aria-hidden="true" />
      <span className="flex-1">
        <strong className="font-semibold text-warning">{`${status.queued} message${status.queued > 1 ? 's' : ''} en attente. `}</strong>
        {text}
      </span>
      {action && (
        <Link href={action.href} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 px-3 text-xs')}>
          {action.label}
        </Link>
      )}
    </div>
  )
}
