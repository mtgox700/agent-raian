'use client'

/**
 * Automatic SMS steps through the workspace's own Brevo account. The key is
 * checked against Brevo on save, stored encrypted, never shown back.
 */
import { useCallback, useEffect, useId, useState } from 'react'
import { Loader2, MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Field, Input } from '@/components/ui'
import { settingsPage, smsCopy as t } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import { useApi } from '@/lib/front/use-api'
import type { SmsState } from '@/lib/front/types-settings'
import { errorMessage } from './ui'

type PublicSettings = SmsState['settings']

export function SmsSettings() {
  const stepUpApi = useApi()
  const id = useId()
  const [settings, setSettings] = useState<PublicSettings>({ enabled: false, sender: '', hasApiKey: false })
  const [apiKey, setApiKey] = useState('')
  const [credits, setCredits] = useState<number | null>(null)
  const [keyRefused, setKeyRefused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const apply = (data: { settings?: PublicSettings; smsCredits?: number | null; keyRefused?: boolean }) => {
    if (data.settings) setSettings(data.settings)
    setCredits(data.smsCredits ?? null)
    setKeyRefused(Boolean(data.keyRefused))
  }

  const load = useCallback(async () => {
    try { apply(await api.call('workspace.getSms', {})) } catch { /* keep defaults */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (enabled: boolean) => {
    setSaving(true)
    try {
      const data = await stepUpApi.call('workspace.saveSms', {
        body: { enabled, sender: settings.sender, apiKey: apiKey.trim() || undefined },
      })
      apply(data)
      setApiKey('')
      toast.success(enabled ? t.activated : t.saved)
    } catch (err) {
      toast.error(err instanceof TypeError ? t.network : errorMessage(err, t.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    setSaving(true)
    try {
      apply(await stepUpApi.call('workspace.removeSms', {}))
      toast.success(t.disconnected)
    } catch {
      toast.error(t.disconnectFailed)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 py-4 text-xs text-quiet">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {settingsPage.loading}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
          <MessageSquareText className="h-4 w-4 text-accent" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-ink">{t.title}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-quiet">
            {t.introBefore}<span className="text-ink">{t.introBrand}</span>{t.introAfter}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-key`} label={t.apiKey}>
          <Input
            id={`${id}-key`}
            size="sm"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.hasApiKey ? t.apiKeySaved : t.apiKeyPlaceholder}
            autoComplete="off"
          />
        </Field>
        <Field id={`${id}-sender`} label={t.sender}>
          <Input
            id={`${id}-sender`}
            size="sm"
            value={settings.sender}
            onChange={(e) => setSettings((s) => ({ ...s, sender: e.target.value }))}
            placeholder={t.senderPlaceholder}
            maxLength={11}
          />
        </Field>
      </div>

      {settings.hasApiKey && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-quiet">
          {keyRefused ? (
            <>
              <Badge tone="danger">{t.keyRefused}</Badge>
              <span className="text-danger">{t.keyRefusedHint}</span>
            </>
          ) : (
            <>
              <Badge tone={settings.enabled ? 'success' : 'neutral'}>{settings.enabled ? t.enabled : t.paused}</Badge>
              {credits !== null && <span className="font-mono tabular-nums">{t.credits(credits)}</span>}
            </>
          )}
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
          {saving ? t.checking : settings.enabled ? t.save : t.activate}
        </Button>
        {settings.hasApiKey && settings.enabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => void save(false)} disabled={saving}>{t.pause}</Button>
        )}
        {settings.hasApiKey && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void disconnect()} disabled={saving} className="hover:text-danger">
            {t.disconnect}
          </Button>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-quiet">{t.note}</p>
    </div>
  )
}
