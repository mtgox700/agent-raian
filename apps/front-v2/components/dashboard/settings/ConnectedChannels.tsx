'use client'

/**
 * LinkedIn accounts connected through Unipile: list, connect (hosted auth in
 * the same tab; back on ?channel=connected) and disconnect. WhatsApp is not
 * offered as an automated sender: it works through the signature's
 * click-to-chat link instead.
 */
import { useCallback, useEffect, useState } from 'react'
import { Linkedin, Loader2, MessageCircle, Plug, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@phantera/sdk'
import { Badge, Button, type BadgeTone } from '@/components/ui'
import { channelsCopy as t, settingsPage } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import { useApi } from '@/lib/front/use-api'
import type { ChannelProvider, ChannelRow } from '@/lib/front/types-settings'
import { errorMessage, iconButton } from './ui'

const ICONS = { LINKEDIN: Linkedin, WHATSAPP: MessageCircle } as const

/** Free vs Premium on LinkedIn: inform, never block. */
function LinkedInPlanHint() {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-line bg-canvas px-3.5 py-3">
      <Linkedin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
      <div className="text-xs leading-relaxed text-quiet">
        <p><span className="font-medium text-ink">{t.hintLead}</span>{t.hint1}</p>
        <p className="mt-1">{t.hint2}</p>
      </div>
    </div>
  )
}

export function ConnectedChannels() {
  const stepUpApi = useApi()
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<ChannelProvider | null>(null)

  const refetch = useCallback(async () => {
    try {
      const data = await api.call('channels.list', {})
      setChannels(data.channels)
    } catch { /* keep the list */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refetch() }, [refetch])

  const connect = async (provider: ChannelProvider) => {
    setConnecting(provider)
    try {
      const data = await stepUpApi.call('channels.connect', { body: { provider } })
      if (!data.url) { toast.error(t.linkFailed); return }
      window.location.href = data.url // Unipile hosted auth (back to settings)
    } catch (err) {
      toast.error(err instanceof ApiError ? errorMessage(err, t.linkFailed) : t.network)
    } finally {
      setConnecting(null)
    }
  }

  const disconnect = async (id: string) => {
    try {
      await stepUpApi.call('channels.disconnect', { params: { channelId: id } })
      toast.success(t.disconnected)
      void refetch()
    } catch {
      toast.error(t.disconnectFailed)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-ink">{t.title}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-quiet">{t.subtitle}</p>
      </div>

      {/* One live account per channel: the button gives way to its state. */}
      <div className="flex flex-wrap gap-2">
        {(['LINKEDIN'] as const).map((p) => {
          const label = t.providers[p]
          const Icon = ICONS[p]
          const isConnected = channels.some((c) => c.provider === p && c.status === 'CONNECTED')
          return isConnected ? (
            <span
              key={p}
              title={t.alreadyConnected(label)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-canvas px-4 text-xs text-ink"
            >
              <Icon className="h-3.5 w-3.5 text-quiet" aria-hidden="true" />
              {label}
              <Badge tone="success">{t.connected}</Badge>
            </span>
          ) : (
            <Button
              key={p}
              variant="outline"
              size="sm"
              onClick={() => void connect(p)}
              disabled={connecting !== null}
              aria-busy={connecting === p || undefined}
            >
              {connecting === p
                ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {t.connect(label)}
            </Button>
          )
        })}
      </div>

      <LinkedInPlanHint />

      {loading ? (
        <div role="status" className="flex items-center gap-2 py-4 text-xs text-quiet">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {settingsPage.loading}
        </div>
      ) : channels.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-line px-4 py-5">
          <Plug className="h-4 w-4 shrink-0 text-quiet" aria-hidden="true" />
          <p className="text-xs text-quiet">{t.empty}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {channels.map((c) => {
            const label = t.providers[c.provider]
            const st = t.status[c.status]
            const Icon = ICONS[c.provider]
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-canvas px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-quiet" aria-hidden="true" />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-xs font-semibold text-ink">{label}{c.label ? ` : ${c.label}` : ''}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={st.tone as BadgeTone}>{st.label}</Badge>
                      {c.status === 'ERROR' && c.lastError && <span className="text-[11px] text-danger">{c.lastError}</span>}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void disconnect(c.id)}
                  title={t.disconnect}
                  aria-label={t.disconnectLabel(label, c.label)}
                  className={`${iconButton} hover:text-danger`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
