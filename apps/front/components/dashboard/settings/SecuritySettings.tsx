'use client'

/**
 * Paramètres › Sécurité (owners and admins): the team two-factor option,
 * the full export of the workspace, and the audit log (read only,
 * exportable as CSV). Everything is decided and
 * recorded by the server (app/api/security/*); this screen only shows it.
 */

import { useCallback, useEffect, useState } from 'react'
import { Archive, Download, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'
import { AUDIT_ACTIONS } from '@/lib/audit/actions'
import { useStepUp } from '@/lib/auth/use-step-up'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AuditRow {
  id: string
  actorLabel: string
  action: string
  label: string
  targetType: string | null
  ipPrefix: string | null
  userAgent: string | null
  result: 'SUCCESS' | 'DENIED' | 'FAILURE'
  details: Record<string, unknown> | null
  createdAt: string
}

interface SecurityState {
  requireTwoFactor: boolean
  canManage: boolean
  ownTwoFactor: boolean | null
}

const RESULT: Record<AuditRow['result'], { label: string; tone: StatusTone }> = {
  SUCCESS: { label: 'Réussi', tone: 'success' },
  DENIED:  { label: 'Refusé', tone: 'warning' },
  FAILURE: { label: 'Échec', tone: 'danger' },
}

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function describe(details: AuditRow['details']): string {
  if (!details) return ''
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k} : ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

function TwoFactorOption({ state, onChange }: { state: SecurityState; onChange: (next: SecurityState) => void }) {
  const { stepUpFetch } = useStepUp()
  const { openUserProfile } = useClerk()
  const [saving, setSaving] = useState(false)

  async function toggle() {
    setSaving(true)
    const next = !state.requireTwoFactor
    const res = await stepUpFetch('/api/security/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requireTwoFactor: next }),
    })
    const data = await res.json().catch(() => ({})) as { error?: string }
    setSaving(false)
    if (!res.ok) { toast.error(data.error ?? 'Modification refusée.'); return }
    onChange({ ...state, requireTwoFactor: next })
    toast.success(next ? 'Double authentification exigée pour toute l’équipe.' : 'Double authentification facultative.')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-cyan" aria-hidden="true" /> Double authentification obligatoire
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Chaque membre doit avoir activé un second facteur (application d’authentification) pour connecter une boîte,
            changer un rôle, supprimer des données ou modifier une clé API. Ces actions demandent de toute façon
            de confirmer son identité si la dernière vérification date de plus de 10 minutes.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.requireTwoFactor}
          aria-label="Double authentification obligatoire"
          disabled={!state.canManage || saving}
          onClick={() => void toggle()}
          className={cn(
            'relative h-6 w-11 flex-shrink-0 rounded-full border border-border transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:opacity-40',
            state.requireTwoFactor ? 'bg-cyan' : 'bg-surface-2',
          )}
        >
          <span className={cn('absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-transform duration-200 ease-signal', state.requireTwoFactor ? 'translate-x-[22px]' : 'translate-x-0.5')} />
        </button>
      </div>
      {!state.canManage && <p className="text-xs text-muted">Seul un propriétaire de l’espace peut changer cette option.</p>}
      {state.ownTwoFactor === false && (
        <p className="text-xs text-warning">
          Votre compte n’a pas encore de second facteur.{' '}
          <button type="button" onClick={() => openUserProfile()} className="underline underline-offset-2 hover:text-white">
            L’activer dans mon profil
          </button>
        </p>
      )}
    </div>
  )
}

function AuditLog() {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (after: string | null) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (after) params.set('after', after)
    if (action) params.set('action', action)
    const res = await fetch(`/api/security/audit?${params}`)
    setLoading(false)
    if (!res.ok) { toast.error('Impossible de charger le journal d’audit.'); return }
    const data = await res.json() as { events: AuditRow[]; next: string | null }
    setRows((prev) => (after ? [...(prev ?? []), ...data.events] : data.events))
    setNext(data.next)
  }, [action])
  useEffect(() => { void load(null) }, [load])

  const csvHref = `/api/security/audit?format=csv${action ? `&action=${encodeURIComponent(action)}` : ''}`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-white">Journal d’audit</h3>
          <p className="mt-0.5 text-xs text-muted">Qui a fait quoi dans l’espace. Conservé 13 mois, non modifiable.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="audit-action">Filtrer par action</label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-9 rounded-md border border-border bg-void px-2 text-xs text-white focus:border-cyan/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40"
          >
            <option value="">Toutes les actions</option>
            {Object.entries(AUDIT_ACTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <a href={csvHref} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 text-xs')}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Exporter (CSV)
          </a>
        </div>
      </div>

      {rows === null ? (
        <div className="h-32 motion-safe:animate-pulse rounded-[10px] border border-border bg-surface" />
      ) : rows.length === 0 ? (
        <p className="rounded-[10px] border border-border px-4 py-6 text-center text-xs text-muted">Aucun événement pour le moment.</p>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-border">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-border font-mono text-[11px] text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 font-medium">Acteur</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
                <th scope="col" className="px-3 py-2 font-medium">Résultat</th>
                <th scope="col" className="px-3 py-2 font-medium">Origine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted">{DATE.format(new Date(r.createdAt))}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-white" title={r.actorLabel}>{r.actorLabel}</td>
                  <td className="px-3 py-2 text-white">
                    {r.label}
                    {r.details && <span className="mt-0.5 block text-[11px] text-muted">{describe(r.details)}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {RESULT[r.result]
                      ? <StatusBadge tone={RESULT[r.result].tone}>{RESULT[r.result].label}</StatusBadge>
                      : <span className="text-muted">{r.result}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted">{[r.userAgent, r.ipPrefix].filter(Boolean).join(' · ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next && (
        <button type="button" disabled={loading} onClick={() => void load(next)} className="inline-flex items-center gap-1.5 rounded-md text-xs text-cyan underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-40">
          {loading && <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />} Voir plus
        </button>
      )}
    </div>
  )
}

interface ExportRow {
  id: string
  status: 'PENDING' | 'READY' | 'FAILED'
  sizeBytes: number | null
  createdAt: string
  expiresAt: string
  url: string | null
}

function size(bytes: number | null): string {
  if (!bytes) return ''
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} Ko` : `${(bytes / 1_000_000).toFixed(1)} Mo`
}

/** Full export of the workspace (RGPD): built in the background, kept 7 days. */
function WorkspaceExports() {
  const { stepUpFetch, confirmStepUp } = useStepUp()
  const [rows, setRows] = useState<ExportRow[] | null>(null)
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/workspace/export')
    if (res.ok) setRows((await res.json() as { exports: ExportRow[] }).exports)
  }, [])
  useEffect(() => { void load() }, [load])

  // While an export is being built, look again every few seconds.
  const pending = rows?.some((r) => r.status === 'PENDING') ?? false
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(() => { void load() }, 5000)
    return () => clearInterval(timer)
  }, [pending, load])

  async function ask() {
    setAsking(true)
    const res = await stepUpFetch('/api/workspace/export', { method: 'POST' })
    const data = await res.json().catch(() => ({})) as { error?: string }
    setAsking(false)
    if (!res.ok) { toast.error(data.error ?? 'L’export n’a pas pu être lancé.'); return }
    toast.success('Export lancé : il sera prêt dans quelques instants.')
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white">
            <Archive className="h-4 w-4 text-cyan" aria-hidden="true" /> Données de l’espace
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Toutes les données de l’espace (campagnes, leads, envois, réponses, équipe, journal) dans une archive ZIP :
            un fichier JSON complet et un CSV par table. Les secrets (jetons, mots de passe, clés API) n’y figurent jamais.
            Le lien de téléchargement expire au bout de 7 jours.
          </p>
        </div>
        <button
          type="button"
          disabled={asking || pending}
          onClick={() => void ask()}
          className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 text-xs')}
        >
          {(asking || pending) && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />}
          {pending ? 'Export en préparation…' : 'Exporter toutes les données'}
        </button>
      </div>
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-border rounded-[10px] border border-border text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-white">{DATE.format(new Date(r.createdAt))}</span>
              {r.status === 'READY' && r.url ? (
                <a
                  href={r.url}
                  onClick={async (e) => {
                    // The download is a navigation: the session is verified first.
                    e.preventDefault()
                    const href = e.currentTarget.href
                    const refusal = await confirmStepUp()
                    if (refusal) { toast.error(refusal); return }
                    window.location.assign(href)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md text-cyan underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Télécharger {size(r.sizeBytes)}
                  <span className="text-muted">· expire le {DATE.format(new Date(r.expiresAt))}</span>
                </a>
              ) : r.status === 'PENDING' ? (
                <StatusBadge tone="signal" live>En préparation</StatusBadge>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <StatusBadge tone="danger">Échec</StatusBadge>
                  <span className="text-muted">relancez l’export</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface DeletionState {
  workspaceName: string
  graceDays: number
  scheduledFor: string | null
}

const DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

/** Owner only (the API answers 403 to others, and the zone stays hidden). */
function WorkspaceDeletion() {
  const { stepUpFetch } = useStepUp()
  const [state, setState] = useState<DeletionState | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/workspace/deletion')
    if (res.ok) setState(await res.json() as DeletionState)
  }, [])
  useEffect(() => { void load() }, [load])
  if (!state) return null

  async function send(method: 'POST' | 'DELETE') {
    setBusy(true)
    const res = await stepUpFetch('/api/workspace/deletion', {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify({ confirmName }) } : {}),
    })
    const data = await res.json().catch(() => ({})) as { error?: string; pausedCampaigns?: number }
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? 'Action refusée.'); return }
    toast.success(method === 'POST'
      ? `Suppression programmée. ${data.pausedCampaigns ?? 0} campagne(s) mise(s) en pause.`
      : 'Suppression annulée : l’espace est conservé. Relancez vos campagnes quand vous voulez.')
    setConfirmName('')
    await load()
  }

  if (state.scheduledFor) {
    return (
      <div className="rounded-[10px] border border-danger/40 bg-obsidian p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-danger"><Trash2 className="h-4 w-4" aria-hidden="true" /> Suppression programmée</h3>
        <p className="mt-1 text-xs leading-relaxed text-white">
          L’espace et toutes ses données seront supprimés définitivement le <strong>{DAY.format(new Date(state.scheduledFor))}</strong>.
          Les campagnes sont en pause et ne peuvent pas repartir. Vous pouvez encore exporter vos données ci-dessus, ou annuler.
        </p>
        <button type="button" disabled={busy} onClick={() => void send('DELETE')}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3 gap-1.5 text-xs')}>
          {busy && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />} Annuler la suppression
        </button>
      </div>
    )
  }

  const matches = confirmName.trim() === state.workspaceName.trim()
  return (
    <div className="rounded-[10px] border border-danger/30 bg-obsidian p-5">
      <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white"><Trash2 className="h-4 w-4 text-danger" aria-hidden="true" /> Supprimer l’espace</h3>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
        Les campagnes s’arrêtent tout de suite et l’abonnement ne sera pas renouvelé. Pendant {state.graceDays} jours vous pouvez
        exporter vos données ou changer d’avis ; ensuite l’espace, ses campagnes, leads, boîtes connectées et son journal sont
        supprimés définitivement. Les comptes des membres sont conservés.
      </p>
      <label htmlFor="confirm-workspace-name" className="mt-3 block text-xs text-muted">
        Pour confirmer, saisissez le nom de l’espace : <strong className="text-white">{state.workspaceName}</strong>
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input id="confirm-workspace-name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off"
          className="min-w-[220px] flex-1 rounded-md border border-border bg-void px-3 py-2 text-sm text-white focus:border-danger/60 focus:outline-none" />
        <button type="button" disabled={!matches || busy} onClick={() => void send('POST')}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-danger px-3 text-xs font-semibold text-white transition-opacity duration-150 ease-signal hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:opacity-40">
          {busy && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />} Programmer la suppression
        </button>
      </div>
    </div>
  )
}

export function SecuritySettings() {
  const [state, setState] = useState<SecurityState | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/security/settings')
      if (res.ok) setState(await res.json() as SecurityState)
      else toast.error('Impossible de charger les réglages de sécurité.')
    })()
  }, [])

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-border bg-obsidian p-5">
        {state ? <TwoFactorOption state={state} onChange={setState} /> : <div className="h-20 motion-safe:animate-pulse rounded-[10px] border border-border bg-surface" />}
      </div>
      <div className="rounded-[10px] border border-border bg-obsidian p-5">
        <WorkspaceExports />
      </div>
      <div className="rounded-[10px] border border-border bg-obsidian p-5">
        <AuditLog />
      </div>
      <WorkspaceDeletion />
    </div>
  )
}
