'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, Trash2, Star, StarOff, Plus, RefreshCw, Inbox, Users, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { SmtpModal } from './SmtpModal'
import { MailboxSendingSettings } from './MailboxSendingSettings'
import { MailboxAliases, type MailboxAliasItem } from './MailboxAliases'
import { useStepUp } from '@/lib/auth/use-step-up'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectedMailbox {
  id:           string
  provider:     'GMAIL' | 'OUTLOOK' | 'SMTP'
  email:        string
  displayName:  string | null
  status:       'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR'
  isDefault:    boolean
  lastSyncAt:   string | null
  lastSyncError: string | null
  dailyCap:        number
  warmupEnabled:   boolean
  sendPausedUntil: string | null
  sentLast24h:     number
  aliases:         MailboxAliasItem[]
  /** Team (E0): whose mailbox it is and what the viewer may do with it. */
  mine:            boolean
  ownerName:       string
  sharedWithTeam:  boolean
  canManage:       boolean
  canShare:        boolean
}

interface MailboxQuota {
  limit: number | null
  planName: string
}

interface Props {
  workspaceId: string
}

// ─── Provider meta ────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  GMAIL:   'Gmail',
  OUTLOOK: 'Outlook / Microsoft 365',
  SMTP:    'SMTP personnalisé',
}

/** Provider initials in a chip: no emoji, no third-party logo. */
const PROVIDER_INITIALS: Record<string, string> = { GMAIL: 'G', OUTLOOK: 'O', SMTP: 'S' }

// ─── Status chip ──────────────────────────────────────────────────────────────

const MAILBOX_STATUS: Record<ConnectedMailbox['status'], { label: string; tone: StatusTone }> = {
  CONNECTED: { label: 'Connecté', tone: 'success' },
  EXPIRED:   { label: 'Expiré',   tone: 'warning' },
  REVOKED:   { label: 'Révoqué',  tone: 'danger' },
  ERROR:     { label: 'Erreur',   tone: 'danger' },
}

function StatusChip({ status }: { status: ConnectedMailbox['status'] }) {
  const { label, tone } = MAILBOX_STATUS[status]
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-40'

// ─── Main component ───────────────────────────────────────────────────────────

export function ConnectedMailboxes({ workspaceId }: Props) {
  const { stepUpFetch, confirmStepUp } = useStepUp()
  // The OAuth consent is a full navigation: the session is verified first.
  const startOAuth = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const href = e.currentTarget.href
    const refusal = await confirmStepUp()
    if (refusal) { toast.error(refusal); return }
    window.location.assign(href)
  }
  const [mailboxes,   setMailboxes]   = useState<ConnectedMailbox[]>([])
  const [loading,     setLoading]     = useState(true)
  const [smtpOpen,    setSmtpOpen]    = useState(false)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [settingId,   setSettingId]   = useState<string | null>(null)
  const [syncing,     setSyncing]     = useState(false)
  const [syncResult,  setSyncResult]  = useState<{ ok: boolean; text: string } | null>(null)
  const [quota,       setQuota]       = useState<MailboxQuota | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/mailbox?workspaceId=${workspaceId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const limit = Number(res.headers.get('X-Mailbox-Limit') ?? '-1')
      setQuota({
        limit:    Number.isFinite(limit) && limit >= 0 ? limit : null,
        planName: decodeURIComponent(res.headers.get('X-Mailbox-Plan') ?? ''),
      })
      setMailboxes(await res.json() as ConnectedMailbox[])
    } catch {
      toast.error('Impossible de charger vos boîtes mail. Rechargez la page.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { void load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Déconnecter cette boîte ?')) return
    setDeletingId(id)
    try {
      let res = await stepUpFetch(`/api/mailbox?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (res.status === 409) {
        const data = await res.json() as { campaigns?: string[]; total?: number }
        const listed = data.campaigns ?? []
        const total = data.total ?? listed.length
        const lines = [
          `${total} campagne${total > 1 ? 's' : ''} envoie${total > 1 ? 'nt' : ''} depuis cette boîte :`,
          ...listed.map((name) => `• ${name}`),
          ...(total > listed.length ? [`… et ${total - listed.length} autre(s)`] : []),
          '',
          'Les campagnes actives seront mises en pause : choisissez ensuite un autre expéditeur sur leur page, puis relancez-les. Continuer ?',
        ]
        const ok = confirm(lines.join('\n'))
        if (!ok) return
        res = await stepUpFetch(`/api/mailbox?id=${id}&workspaceId=${workspaceId}&force=1`, { method: 'DELETE' })
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { pausedCampaigns?: number }
      const paused = data.pausedCampaigns ?? 0
      toast.success(paused > 0
        ? `Boîte déconnectée : ${paused} campagne${paused > 1 ? 's' : ''} mise${paused > 1 ? 's' : ''} en pause`
        : 'Boîte déconnectée')
    } catch {
      toast.error("La boîte n'a pas pu être déconnectée. Réessayez.")
    } finally {
      setDeletingId(null)
    }
    await load()
  }

  const handleSync = async (resetHistory = false) => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/mailbox/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, resetHistory }),
      })
      const data = await res.json() as { totalReplies?: number; error?: string }
      if (res.ok) {
        setSyncResult({ ok: true, text: `${data.totalReplies ?? 0} nouvelle(s) réponse(s) détectée(s)` })
        await load()
      } else {
        setSyncResult({ ok: false, text: data.error ?? 'Échec de la vérification' })
      }
    } catch (err) {
      setSyncResult({ ok: false, text: err instanceof Error ? err.message : 'Échec de la vérification' })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 5000)
    }
  }

  const handleRescan = async () => {
    if (!confirm('Relire les 48 dernières heures de votre boîte mail ? Utile pour retrouver les réponses manquées.')) return
    await handleSync(true)
  }

  /** Admins only: lets every member's campaigns send from this mailbox, or takes it back. */
  const handleShare = async (mb: ConnectedMailbox) => {
    if (mb.sharedWithTeam && !confirm(`Ne plus partager ${mb.email} ? Les campagnes des autres membres qui l'utilisent seront mises en pause, avec un expéditeur à rechoisir.`)) return
    setSettingId(mb.id)
    try {
      const res = await fetch('/api/mailbox', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, mailboxId: mb.id, sharedWithTeam: !mb.sharedWithTeam }),
      })
      const data = await res.json().catch(() => ({})) as { pausedCampaigns?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const paused = data.pausedCampaigns ?? 0
      toast.success(mb.sharedWithTeam
        ? `Boîte reprise${paused > 0 ? ` : ${paused} campagne${paused > 1 ? 's' : ''} mise${paused > 1 ? 's' : ''} en pause` : ''}`
        : 'Boîte partagée avec l’équipe')
    } catch (err) {
      toast.error(err instanceof Error && !err.message.startsWith('HTTP') ? err.message : "Le partage n'a pas pu être modifié. Réessayez.")
    } finally {
      setSettingId(null)
    }
    await load()
  }

  const handleSetDefault = async (mailboxId: string, isDefault: boolean) => {
    setSettingId(mailboxId)
    try {
      const res = await fetch('/api/mailbox', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, mailboxId, isDefault: !isDefault }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      toast.error("La boîte par défaut n'a pas pu être modifiée. Réessayez.")
    } finally {
      setSettingId(null)
    }
    await load()
  }

  // Compute which mailbox will actually be used for sending (mirrors server logic)
  const activeMailbox = mailboxes.find((mb) => mb.isDefault && mb.status === 'CONNECTED')
    ?? mailboxes.find((mb) => mb.status === 'CONNECTED')
    ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-white">Boîtes e-mail connectées</h3>
          <p className="mt-0.5 text-xs text-muted">
            Les e-mails de campagne partent depuis votre vraie boîte mail.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {mailboxes.some((mb) => mb.status === 'CONNECTED' && mb.provider !== 'SMTP') && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSync(false)}
                disabled={syncing}
                aria-busy={syncing || undefined}
                className="h-8 gap-1.5 px-3 text-xs"
                title="Vérifier les nouvelles réponses maintenant"
              >
                <Inbox className="h-3 w-3" aria-hidden="true" />
                {syncing ? 'Vérification…' : 'Vérifier les réponses'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRescan}
                disabled={syncing}
                className="h-8 gap-1.5 px-3 text-xs"
                title="Relire les 48 dernières heures de votre boîte mail"
              >
                <RefreshCw className={cn('h-3 w-3', syncing && 'motion-safe:animate-spin')} aria-hidden="true" />
                Relire 48 h
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={load}
            className={cn(iconBtn, 'hover:bg-surface hover:text-white')}
            title="Actualiser"
            aria-label="Actualiser la liste des boîtes"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {syncResult && (
        <p
          role={syncResult.ok ? 'status' : 'alert'}
          className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-xs',
            syncResult.ok ? 'border-success-fg/25 text-success-fg' : 'border-danger/25 text-danger',
          )}
        >
          {syncResult.ok
            ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
          {syncResult.text}
        </p>
      )}

      {/* Active sender banner: tells the user EXACTLY what will be used */}
      {!loading && (
        <div className={cn(
          'rounded-[10px] border bg-void p-3',
          activeMailbox ? 'border-success-fg/25' : 'border-warning/25',
        )}>
          <div className="flex items-start gap-2.5">
            <span
              className={cn('mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full', activeMailbox ? 'bg-success-fg' : 'bg-warning')}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className={cn('text-xs font-semibold', activeMailbox ? 'text-success-fg' : 'text-warning')}>
                {activeMailbox
                  ? `Expéditeur actif : ${activeMailbox.email}`
                  : 'Aucun expéditeur : envoi par l’adresse de secours Phantera (outreach@phantera-tn.com)'}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {activeMailbox
                  ? `Les prochaines campagnes partiront depuis cette adresse via ${
                      activeMailbox.provider === 'GMAIL' ? 'Gmail' :
                      activeMailbox.provider === 'OUTLOOK' ? 'Microsoft' : 'SMTP'
                    }.`
                  : 'Connectez Gmail ou Outlook ci-dessous pour envoyer depuis votre vraie boîte mail.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mailbox list */}
      <div className="space-y-2">
          {loading ? (
            <div className="h-16 rounded-[10px] border border-border bg-surface motion-safe:animate-pulse" role="status" aria-label="Chargement des boîtes" />
          ) : mailboxes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-border py-8 text-muted">
              <Mail className="mb-2 h-6 w-6" aria-hidden="true" />
              <p className="text-sm text-white">Aucune boîte connectée</p>
              <p className="mt-1 text-xs">Les campagnes utilisent le domaine Phantera par défaut.</p>
            </div>
          ) : (
            mailboxes.map((mb) => (
              <div
                key={mb.id}
                className={cn(
                  'flex items-start gap-3 rounded-[10px] border bg-void p-3',
                  mb.isDefault ? 'border-cyan/40' : 'border-border',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface font-mono text-xs font-semibold text-white" aria-hidden="true">{PROVIDER_INITIALS[mb.provider] ?? <Mail className="h-4 w-4" />}</span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{mb.email}</span>
                    <StatusChip status={mb.status} />
                    {mb.isDefault && <StatusBadge tone="signal">Par défaut</StatusBadge>}
                    {mb.sharedWithTeam && <StatusBadge tone="neutral">Partagée avec l’équipe</StatusBadge>}
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    {PROVIDER_LABELS[mb.provider]}
                    {!mb.mine && ` · de ${mb.ownerName}`}
                    {mb.lastSyncAt && ` · relevée à ${new Date(mb.lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                  {mb.lastSyncError && (
                    <p className="mt-0.5 truncate text-xs text-danger">{mb.lastSyncError}</p>
                  )}
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
                      onClick={() => handleShare(mb)}
                      disabled={settingId === mb.id}
                      aria-pressed={mb.sharedWithTeam}
                      aria-label={mb.sharedWithTeam ? `Ne plus partager ${mb.email} avec l’équipe` : `Partager ${mb.email} avec l’équipe`}
                      className={cn(iconBtn, mb.sharedWithTeam ? 'bg-surface text-cyan' : 'hover:bg-surface hover:text-white')}
                      title={mb.sharedWithTeam ? 'Ne plus partager avec l’équipe' : 'Partager avec l’équipe'}
                    >
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                  {mb.canManage && (<>
                  <button
                    type="button"
                    onClick={() => handleSetDefault(mb.id, mb.isDefault)}
                    disabled={settingId === mb.id}
                    aria-pressed={mb.isDefault}
                    aria-label={mb.isDefault ? `Retirer ${mb.email} du défaut` : `Définir ${mb.email} par défaut`}
                    className={cn(iconBtn, mb.isDefault ? 'text-cyan hover:bg-surface' : 'hover:bg-surface hover:text-white')}
                    title={mb.isDefault ? 'Retirer du défaut' : 'Définir par défaut'}
                  >
                    {mb.isDefault ? <Star className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" /> : <StarOff className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(mb.id)}
                    disabled={deletingId === mb.id}
                    aria-label={`Déconnecter ${mb.email}`}
                    className={cn(iconBtn, 'hover:bg-surface hover:text-danger')}
                    title="Déconnecter"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  </>)}
                </div>
              </div>
            ))
          )}
      </div>

      {quota && (
        <p className="font-mono text-xs tabular-nums text-muted">
          {quota.limit === null
            ? `${mailboxes.length} boîte${mailboxes.length > 1 ? 's' : ''} connectée${mailboxes.length > 1 ? 's' : ''} · boîtes illimitées (plan ${quota.planName})`
            : `${mailboxes.length} / ${quota.limit} boîte${quota.limit > 1 ? 's' : ''} d'envoi (plan ${quota.planName})`}
          {quota.limit !== null && mailboxes.length >= quota.limit && (
            <span className="mt-1 block font-body text-warning">
              Limite atteinte : une nouvelle boîte sera refusée, mais vous pouvez reconnecter une boîte existante. Les alias ne comptent pas.
            </span>
          )}
        </p>
      )}

      {/* Connect buttons */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <a
          href={`/api/auth/gmail?workspaceId=${workspaceId}`}
          onClick={startOAuth}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Connecter Gmail
        </a>
        <a
          href={`/api/auth/outlook?workspaceId=${workspaceId}`}
          onClick={startOAuth}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Connecter Outlook
        </a>
        <Button type="button" variant="outline" size="sm" onClick={() => setSmtpOpen(true)} className="gap-2">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          SMTP personnalisé
        </Button>
      </div>

      <SmtpModal
        open={smtpOpen}
        workspaceId={workspaceId}
        onClose={() => setSmtpOpen(false)}
        onSuccess={() => { setSmtpOpen(false); void load() }}
      />
    </div>
  )
}
