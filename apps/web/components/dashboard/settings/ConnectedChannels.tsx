'use client'

/**
 * ConnectedChannels: LinkedIn / WhatsApp accounts connected via Unipile.
 * Mirrors the ConnectedMailboxes UX: list + connect + disconnect. The connect
 * button opens Unipile's hosted auth in the same tab; on return
 * (?channel=connected) the list refetches and shows the live account.
 */

import { useCallback, useEffect, useState } from 'react'
import { Linkedin, MessageCircle, Loader2, Trash2, Plug } from 'lucide-react'
import { toast } from 'sonner'
import { LinkedInPlanHint } from '@/components/dashboard/LinkedInPlanHint'
import { useStepUp } from '@/lib/auth/use-step-up'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'

interface Channel {
  id: string
  provider: 'LINKEDIN' | 'WHATSAPP'
  status: 'PENDING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  label: string | null
  lastError: string | null
  createdAt: string
}

const PROVIDER_META = {
  LINKEDIN: { label: 'LinkedIn', icon: Linkedin },
  WHATSAPP: { label: 'WhatsApp', icon: MessageCircle },
} as const

const STATUS_META: Record<Channel['status'], { label: string; tone: StatusTone }> = {
  CONNECTED:    { label: 'Connecté',    tone: 'success' },
  PENDING:      { label: 'En attente',  tone: 'warning' },
  DISCONNECTED: { label: 'Déconnecté',  tone: 'neutral' },
  ERROR:        { label: 'Erreur',      tone: 'danger' },
}

export function ConnectedChannels() {
  const { stepUpFetch } = useStepUp()
  const [channels, setChannels]     = useState<Channel[]>([])
  const [loading, setLoading]       = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/channels')
      if (res.ok) {
        const data = (await res.json()) as { channels: Channel[] }
        setChannels(data.channels)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refetch() }, [refetch])

  const connect = async (provider: 'LINKEDIN' | 'WHATSAPP') => {
    setConnecting(provider)
    try {
      const res = await stepUpFetch('/api/channels/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? 'Impossible de générer le lien de connexion')
        return
      }
      window.location.href = data.url // Unipile hosted auth (retour -> settings)
    } catch {
      toast.error('Erreur réseau : réessayez')
    } finally {
      setConnecting(null)
    }
  }

  const disconnect = async (id: string) => {
    const res = await stepUpFetch(`/api/channels/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Canal déconnecté')
      void refetch()
    } else {
      toast.error('Échec de la déconnexion')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-sm font-semibold text-white">Canaux de prospection</h3>
        <p className="mt-0.5 text-xs text-muted">
          Connectez LinkedIn pour des séquences multicanal : votre compte, vos messages,
          avec les garde-fous Phantera (plafonds quotidiens, arrêt à la réponse). Pour WhatsApp,
          ajoutez votre numéro pro à la signature ci-dessous : le prospect vous écrit en premier.
        </p>
      </div>

      {/* Connect buttons: disabled once the provider has a live account
          (V0 rule: one account per channel; multi-sender = future feature) */}
      <div className="flex flex-wrap gap-2">
        {/* WhatsApp is not offered as an automated sender: WhatsApp bans accounts
            that write first to people who did not opt in. It works through the
            signature's click-to-chat link instead (lib/email/signature.ts). */}
        {(['LINKEDIN'] as const).map((p) => {
          const meta = PROVIDER_META[p]
          const Icon = meta.icon
          const isConnected = channels.some((c) => c.provider === p && c.status === 'CONNECTED')
          return (
            isConnected ? (
              <span
                key={p}
                title={`Un compte ${meta.label} est déjà connecté : déconnectez-le pour en changer.`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-obsidian px-4 text-xs text-white"
              >
                <Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                {meta.label}
                <StatusBadge tone="success">Connecté</StatusBadge>
              </span>
            ) : (
              <Button
                key={p}
                variant="outline"
                size="sm"
                onClick={() => connect(p)}
                disabled={connecting !== null}
                aria-busy={connecting === p || undefined}
                className="gap-2"
              >
                {connecting === p
                  ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
                  : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                {`Connecter ${meta.label}`}
              </Button>
            )
          )
        })}
      </div>

      {/* Free vs Premium education: heads off the #1 support question */}
      <LinkedInPlanHint />

      {/* Channel list */}
      {loading ? (
        <div role="status" className="flex items-center gap-2 py-4 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Chargement…
        </div>
      ) : channels.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-dashed border-border px-4 py-5">
          <Plug className="h-4 w-4 text-muted" aria-hidden="true" />
          <p className="text-xs text-muted">
            Aucun canal connecté : vos séquences n'utilisent que l'e-mail pour l'instant.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {channels.map((c) => {
            const meta = PROVIDER_META[c.provider]
            const st = STATUS_META[c.status]
            const Icon = meta.icon
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-obsidian px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden="true" />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-xs font-semibold text-white">
                      {meta.label}{c.label ? ` : ${c.label}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      {c.status === 'ERROR' && c.lastError && (
                        <span className="text-[11px] text-danger">{c.lastError}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => disconnect(c.id)}
                  title="Déconnecter"
                  aria-label={`Déconnecter ${meta.label}${c.label ? ` ${c.label}` : ''}`}
                  className="h-8 w-8 flex-shrink-0 text-muted hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
