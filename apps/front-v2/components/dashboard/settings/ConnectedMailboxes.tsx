'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Inbox, Mail, Plus, RefreshCw, Star, StarOff, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, createClient } from '@phantera/sdk'
import { Badge, Button, EmptyState, Skeleton, buttonVariants, type BadgeTone } from '@/components/ui'
import { mailboxCopy as t, settingsPage } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import { useApi } from '@/lib/front/use-api'
import type { MailboxRow } from '@/lib/front/types-settings'
import { cn } from '@/lib/utils'
import { MailboxAliases } from './MailboxAliases'
import { MailboxSendingSettings } from './MailboxSendingSettings'
import { SmtpDialog } from './SmtpDialog'
import { errorBody, errorMessage, iconButton, useConfirm } from './ui'

interface MailboxQuota { limit: number | null; planName: string }

/**
 * mailbox.list: the plan quota travels in the X-Mailbox-Limit / X-Mailbox-Plan
 * headers, which `api.call` does not expose; this client keeps them.
 */
async function listMailboxes(workspaceId: string): Promise<{ rows: MailboxRow[]; quota: MailboxQuota }> {
  const seen: { headers?: Headers } = {}
  const client = createClient({
    fetch: async (input, init) => {
      const res = await fetch(input, init)
      seen.headers = res.headers
      return res
    },
  })
  const rows = await client.call('mailbox.list', { query: { workspaceId } })
  const limit = Number(seen.headers?.get('X-Mailbox-Limit') ?? '-1')
  return {
    rows,
    quota: {
      limit: Number.isFinite(limit) && limit >= 0 ? limit : null,
      planName: decodeURIComponent(seen.headers?.get('X-Mailbox-Plan') ?? ''),
    },
  }
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export function ConnectedMailboxes({ workspaceId }: { workspaceId: string }) {
  const stepUpApi = useApi()
  const { ask, dialog } = useConfirm()
  const [mailboxes, setMailboxes] = useState<MailboxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [smtpOpen, setSmtpOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingId, setSettingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [quota, setQuota] = useState<MailboxQuota | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { rows, quota: q } = await listMailboxes(workspaceId)
      setQuota(q)
      setMailboxes(rows)
    } catch {
      toast.error(t.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { void load() }, [load])

  // The OAuth consent is a full navigation: the session is verified first.
  const startOAuth = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const href = e.currentTarget.href
    try {
      await stepUpApi.call('security.stepUp', {})
    } catch (err) {
      toast.error(errorMessage(err, settingsPage.stepUpCancelled))
      return
    }
    window.location.assign(href)
  }

  const handleDelete = async (id: string) => {
    if (!(await ask({ title: t.confirmDisconnect, confirmLabel: t.disconnect, danger: true }))) return
    setDeletingId(id)
    try {
      let result: { pausedCampaigns: number }
      try {
        result = await stepUpApi.call('mailbox.disconnect', { query: { id, workspaceId } })
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err
        const data = errorBody<{ campaigns?: string[]; total?: number }>(err)
        const listed = data?.campaigns ?? []
        const total = data?.total ?? listed.length
        const ok = await ask({ title: t.inUseQuestion, lines: t.inUse(total, listed), confirmLabel: t.confirm, danger: true })
        if (!ok) return
        result = await stepUpApi.call('mailbox.disconnect', { query: { id, workspaceId, force: '1' } })
      }
      toast.success(t.disconnected(result.pausedCampaigns ?? 0))
    } catch {
      toast.error(t.disconnectFailed)
    } finally {
      setDeletingId(null)
    }
    await load()
  }

  const handleSync = async (resetHistory = false) => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const data = await api.call('mailbox.sync', { body: { workspaceId, resetHistory } })
      setSyncResult({ ok: true, text: t.syncFound(data.totalReplies ?? 0) })
      await load()
    } catch (err) {
      setSyncResult({ ok: false, text: errorMessage(err, t.syncFailed) })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 5000)
    }
  }

  const handleRescan = async () => {
    if (!(await ask({ title: t.confirmRescan, confirmLabel: t.rescan }))) return
    await handleSync(true)
  }

  /** Admins only: lets every member's campaigns send from this mailbox, or takes it back. */
  const handleShare = async (mb: MailboxRow) => {
    if (mb.sharedWithTeam && !(await ask({ title: t.confirmUnshare(mb.email), confirmLabel: t.confirm, danger: true }))) return
    setSettingId(mb.id)
    try {
      const data = await api.call('mailbox.update', { body: { workspaceId, mailboxId: mb.id, sharedWithTeam: !mb.sharedWithTeam } })
      const paused = data.pausedCampaigns ?? 0
      toast.success(mb.sharedWithTeam ? t.unshared(paused) : t.shared)
    } catch (err) {
      toast.error(errorMessage(err, t.shareFailed))
    } finally {
      setSettingId(null)
    }
    await load()
  }

  const handleSetDefault = async (mailboxId: string, isDefault: boolean) => {
    setSettingId(mailboxId)
    try {
      await api.call('mailbox.update', { body: { workspaceId, mailboxId, isDefault: !isDefault } })
    } catch {
      toast.error(t.defaultFailed)
    } finally {
      setSettingId(null)
    }
    await load()
  }

  // Which mailbox will actually be used for sending (mirrors the server's choice).
  const activeMailbox = mailboxes.find((mb) => mb.isDefault && mb.status === 'CONNECTED')
    ?? mailboxes.find((mb) => mb.status === 'CONNECTED')
    ?? null
  const canSync = mailboxes.some((mb) => mb.status === 'CONNECTED' && mb.provider !== 'SMTP')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-ink">{t.title}</h3>
          <p className="mt-1 text-sm text-quiet">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {canSync && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSync(false)}
                disabled={syncing}
                aria-busy={syncing || undefined}
                title={t.checkTitle}
                className="text-xs"
              >
                <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
                {syncing ? t.checking : t.checkReplies}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleRescan()} disabled={syncing} title={t.rescanTitle} className="text-xs">
                <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
                {t.rescan}
              </Button>
            </>
          )}
          <button type="button" onClick={() => void load()} className={iconButton} title={t.refresh} aria-label={t.refreshLabel}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {syncResult && (
        <p
          role={syncResult.ok ? 'status' : 'alert'}
          className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-xs',
            syncResult.ok ? 'border-success/30 text-success' : 'border-danger/30 text-danger',
          )}
        >
          {syncResult.ok
            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            : <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {syncResult.text}
        </p>
      )}

      {/* The sender in use, said plainly. */}
      {!loading && (
        <div className={cn('flex items-start gap-3 rounded-md border bg-canvas p-3', activeMailbox ? 'border-success/30' : 'border-warning/30')}>
          <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', activeMailbox ? 'bg-success' : 'bg-warning')} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className={cn('text-xs font-semibold', activeMailbox ? 'text-success' : 'text-warning')}>
              {activeMailbox ? t.activeSender(activeMailbox.email) : t.noSender}
            </p>
            <p className="mt-0.5 text-[11px] text-quiet">{activeMailbox ? t.activeVia(activeMailbox.provider) : t.connectHint}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div role="status" aria-label={t.loadingList}><Skeleton className="h-16 rounded-md border border-line" /></div>
        ) : mailboxes.length === 0 ? (
          <div className="rounded-md border border-dashed border-line">
            <EmptyState icon={Mail} title={t.emptyTitle} className="py-6">{t.emptyBody}</EmptyState>
          </div>
        ) : (
          <ul className="space-y-2">
            {mailboxes.map((mb) => {
              const status = t.status[mb.status]
              return (
                <li key={mb.id} className={cn('flex items-start gap-3 rounded-md border bg-canvas p-3', mb.isDefault ? 'border-accent/40' : 'border-line')}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface font-mono text-xs font-semibold text-ink" aria-hidden="true">
                    {t.initials[mb.provider]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{mb.email}</span>
                      <Badge tone={status.tone as BadgeTone}>{status.label}</Badge>
                      {mb.isDefault && <Badge tone="signal">{t.isDefault}</Badge>}
                      {mb.sharedWithTeam && <Badge tone="neutral">{t.isShared}</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-quiet">
                      {t.providers[mb.provider]}
                      {!mb.mine && t.ownedBy(mb.ownerName)}
                      {mb.lastSyncAt && t.syncedAt(timeOf(mb.lastSyncAt))}
                    </p>
                    {mb.lastSyncError && <p className="mt-0.5 truncate text-xs text-danger">{mb.lastSyncError}</p>}
                    {mb.status === 'CONNECTED' && mb.canManage && (
                      <MailboxSendingSettings
                        workspaceId={workspaceId}
                        mailboxId={mb.id}
                        provider={mb.provider}
                        dailyCap={mb.dailyCap}
                        warmupEnabled={mb.warmupEnabled}
                        sentLast24h={mb.sentLast24h}
                        sendPausedUntil={mb.sendPausedUntil}
                        onSaved={() => void load()}
                      />
                    )}
                    {mb.status === 'CONNECTED' && mb.canManage && (mb.provider === 'GMAIL' || mb.provider === 'SMTP') && (
                      <MailboxAliases
                        mailboxId={mb.id}
                        mailboxEmail={mb.email}
                        provider={mb.provider}
                        aliases={mb.aliases ?? []}
                        onChanged={() => void load()}
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-0.5">
                    {mb.canShare && (
                      <button
                        type="button"
                        onClick={() => void handleShare(mb)}
                        disabled={settingId === mb.id}
                        aria-pressed={mb.sharedWithTeam}
                        aria-label={t.shareLabel(mb.email, mb.sharedWithTeam)}
                        title={t.shareTitle(mb.sharedWithTeam)}
                        className={cn(iconButton, mb.sharedWithTeam && 'bg-surface text-accent')}
                      >
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                    {mb.canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleSetDefault(mb.id, mb.isDefault)}
                          disabled={settingId === mb.id}
                          aria-pressed={mb.isDefault}
                          aria-label={t.defaultLabel(mb.email, mb.isDefault)}
                          title={t.defaultTitle(mb.isDefault)}
                          className={cn(iconButton, mb.isDefault && 'text-accent')}
                        >
                          {mb.isDefault
                            ? <Star className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                            : <StarOff className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(mb.id)}
                          disabled={deletingId === mb.id}
                          aria-label={t.disconnectLabel(mb.email)}
                          title={t.disconnect}
                          className={cn(iconButton, 'hover:text-danger')}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {quota && (
        <p className="font-mono text-xs tabular-nums text-quiet">
          {t.quota(mailboxes.length, quota.limit, quota.planName)}
          {quota.limit !== null && mailboxes.length >= quota.limit && (
            <span className="mt-1 block font-sans text-warning">{t.quotaFull}</span>
          )}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <a
          href={api.url('auth.gmailStart', { query: { workspaceId } })}
          onClick={(e) => void startOAuth(e)}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t.connectGmail}
        </a>
        <a
          href={api.url('auth.outlookStart', { query: { workspaceId } })}
          onClick={(e) => void startOAuth(e)}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t.connectOutlook}
        </a>
        <Button type="button" variant="outline" size="sm" onClick={() => setSmtpOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t.connectSmtp}
        </Button>
      </div>

      <SmtpDialog
        open={smtpOpen}
        workspaceId={workspaceId}
        onClose={() => setSmtpOpen(false)}
        onSuccess={() => { setSmtpOpen(false); void load() }}
      />
      {dialog}
    </div>
  )
}
