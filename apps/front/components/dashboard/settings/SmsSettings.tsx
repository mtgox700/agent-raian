'use client'

/**
 * SmsSettings: automatic SMS steps through the workspace's own Brevo account.
 * The key is checked against Brevo on save, stored encrypted, never shown back.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import { useStepUp } from '@/lib/auth/use-step-up'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

interface PublicSettings {
  enabled: boolean
  sender: string
  hasApiKey: boolean
}

interface SettingsResponse {
  settings?: PublicSettings
  smsCredits?: number | null
  keyRefused?: boolean
  error?: string
}

export function SmsSettings() {
  const { stepUpFetch } = useStepUp()
  const [settings, setSettings] = useState<PublicSettings>({ enabled: false, sender: '', hasApiKey: false })
  const [apiKey, setApiKey] = useState('')
  const [credits, setCredits] = useState<number | null>(null)
  const [keyRefused, setKeyRefused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const apply = (data: SettingsResponse) => {
    if (data.settings) setSettings(data.settings)
    setCredits(data.smsCredits ?? null)
    setKeyRefused(Boolean(data.keyRefused))
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/sms')
      if (res.ok) apply(await res.json() as SettingsResponse)
    } catch { /* keep defaults */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (enabled: boolean) => {
    setSaving(true)
    try {
      const res = await stepUpFetch('/api/workspace/sms', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ enabled, sender: settings.sender, apiKey: apiKey.trim() || undefined }),
      })
      const data = await res.json() as SettingsResponse
      if (!res.ok) { toast.error(data.error ?? 'Enregistrement impossible'); return }
      apply(data)
      setApiKey('')
      toast.success(enabled ? 'SMS automatiques activés' : 'Réglages SMS enregistrés')
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    setSaving(true)
    try {
      const res = await stepUpFetch('/api/workspace/sms', { method: 'DELETE' })
      if (!res.ok) { toast.error('Déconnexion impossible'); return }
      apply(await res.json() as SettingsResponse)
      toast.success('Compte Brevo déconnecté')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div role="status" className="flex items-center gap-2 py-4 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Chargement…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-border bg-surface">
          <MessageSquareText className="h-4 w-4 text-cyan" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-white">SMS automatiques</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Les étapes SMS de vos séquences partent seules depuis votre compte <span className="text-white">Brevo</span>,
            comme vos e-mails. Brevo ajoute « STOP au … », bloque les numéros désinscrits et n&apos;envoie ni la nuit,
            ni le dimanche, ni les jours fériés. Les SMS sont facturés par Brevo sur votre compte.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block font-mono text-xs text-muted">
          Clé API Brevo
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.hasApiKey ? '•••••••• (enregistrée)' : 'xkeysib-…'}
            autoComplete="off"
            className="mt-1 h-9 w-full rounded-md border border-border bg-void px-3 font-body text-xs text-white outline-none transition-colors duration-150 ease-signal placeholder:text-muted/60 focus:border-cyan/60 focus-visible:ring-2 focus-visible:ring-cyan/40"
          />
        </label>
        <label className="block font-mono text-xs text-muted">
          Nom d&apos;expéditeur (3 à 11 caractères)
          <input
            value={settings.sender}
            onChange={(e) => setSettings((s) => ({ ...s, sender: e.target.value }))}
            placeholder="MaSociete"
            maxLength={11}
            className="mt-1 h-9 w-full rounded-md border border-border bg-void px-3 font-body text-xs text-white outline-none transition-colors duration-150 ease-signal placeholder:text-muted/60 focus:border-cyan/60 focus-visible:ring-2 focus-visible:ring-cyan/40"
          />
        </label>
      </div>

      {settings.hasApiKey && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {keyRefused
            ? <><StatusBadge tone="danger">Clé refusée</StatusBadge><span className="text-danger">Brevo refuse la clé enregistrée : collez-en une nouvelle.</span></>
            : <>
                <StatusBadge tone={settings.enabled ? 'success' : 'neutral'}>{settings.enabled ? 'SMS activés' : 'SMS en pause'}</StatusBadge>
                {credits !== null && <span className="font-mono tabular-nums">{credits.toLocaleString('fr-FR')} crédit{credits > 1 ? 's' : ''} SMS sur Brevo</span>}
              </>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void save(true)}
          disabled={saving || !settings.sender.trim() || (!settings.hasApiKey && !apiKey.trim())}
          aria-busy={saving || undefined}
        >
          {saving ? 'Vérification…' : settings.enabled ? 'Enregistrer' : 'Activer les SMS automatiques'}
        </Button>
        {settings.hasApiKey && settings.enabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => void save(false)} disabled={saving}>
            Mettre en pause
          </Button>
        )}
        {settings.hasApiKey && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void disconnect()} disabled={saving} className="text-muted hover:text-danger">
            Déconnecter Brevo
          </Button>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        Prospection B2B uniquement : le message doit concerner le métier du destinataire et vous identifier (CNIL).
        Sans compte Brevo, les étapes SMS restent dans « À envoyer », à envoyer depuis votre téléphone.
      </p>
    </div>
  )
}
