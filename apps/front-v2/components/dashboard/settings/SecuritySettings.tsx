'use client'

/**
 * Paramètres › Sécurité (owners and admins): the team two-factor option, the
 * full export of the workspace, the audit log (read only, exportable as CSV)
 * and the deletion of the workspace. The server decides and records
 * everything; this screen only shows it.
 */
import { useCallback, useEffect, useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { Archive, Download, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge, Button, Input, Panel, Select, Skeleton, buttonVariants,
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui'
import { AUDIT_ACTIONS } from '@/lib/audit/actions'
import { securityCopy as t, settingsPage } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import { useApi } from '@/lib/front/use-api'
import type { AuditEvent, DeletionState, SecurityState, WorkspaceExport } from '@/lib/front/types-settings'
import { cn } from '@/lib/utils'
import { errorMessage, SectionHead, Switch } from './ui'

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
const DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

function describe(details: unknown): string {
  if (!details || typeof details !== 'object') return ''
  return Object.entries(details as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k} : ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

function size(bytes: number | null): string {
  if (!bytes) return ''
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} Ko` : `${(bytes / 1_000_000).toFixed(1)} Mo`
}

const spinner = <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />

function TwoFactorOption({ state, onChange }: { state: SecurityState; onChange: (next: SecurityState) => void }) {
  const stepUpApi = useApi()
  const { openUserProfile } = useClerk()
  const [saving, setSaving] = useState(false)

  async function toggle() {
    setSaving(true)
    const next = !state.requireTwoFactor
    try {
      await stepUpApi.call('security.updateSettings', { body: { requireTwoFactor: next } })
    } catch (err) {
      setSaving(false)
      toast.error(errorMessage(err, t.twoFactorRefused))
      return
    }
    setSaving(false)
    onChange({ ...state, requireTwoFactor: next })
    toast.success(next ? t.twoFactorOn : t.twoFactorOff)
  }

  return (
    <div className="space-y-3">
      <SectionHead
        title={<><ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" /> {t.twoFactorTitle}</>}
        action={
          <Switch
            checked={state.requireTwoFactor}
            label={t.twoFactorTitle}
            disabled={!state.canManage || saving}
            onChange={() => void toggle()}
          />
        }
      >
        {t.twoFactorBody}
      </SectionHead>
      {!state.canManage && <p className="text-xs text-quiet">{t.ownerOnly}</p>}
      {state.ownTwoFactor === false && (
        <p className="text-xs text-warning">
          {t.ownMissing}{' '}
          <button type="button" onClick={() => openUserProfile()} className="underline underline-offset-2 hover:text-ink">
            {t.ownActivate}
          </button>
        </p>
      )}
    </div>
  )
}

function AuditLog() {
  const [rows, setRows] = useState<AuditEvent[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (after: string | null) => {
    setLoading(true)
    try {
      const data = await api.call('security.listAudit', { query: { after: after ?? undefined, action: action || undefined } })
      setRows((prev) => (after ? [...(prev ?? []), ...data.events] : data.events))
      setNext(data.next)
    } catch {
      toast.error(t.auditLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [action])
  useEffect(() => { void load(null) }, [load])

  const csvHref = api.url('security.listAudit', { query: { format: 'csv', action: action || undefined } })

  return (
    <div className="space-y-4">
      <SectionHead
        title={t.auditTitle}
        action={
          <>
            <label className="sr-only" htmlFor="audit-action">{t.filter}</label>
            <Select id="audit-action" size="sm" value={action} onChange={(e) => setAction(e.target.value)} wrapperClassName="w-56" className="text-xs">
              <option value="">{t.allActions}</option>
              {Object.entries(AUDIT_ACTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
            <a href={csvHref} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs')}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> {t.exportCsv}
            </a>
          </>
        }
      >
        {t.auditSubtitle}
      </SectionHead>

      {rows === null ? (
        <div aria-busy="true" aria-label={settingsPage.loading}><Skeleton className="h-32 rounded-md border border-line" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-line px-4 py-6 text-center text-xs text-quiet">{t.auditEmpty}</p>
      ) : (
        <div className="rounded-md border border-line">
          <Table className="min-w-[640px]">
            <TableCaption className="sr-only">{t.auditCaption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t.cols.date}</TableHead>
                <TableHead>{t.cols.actor}</TableHead>
                <TableHead>{t.cols.action}</TableHead>
                <TableHead>{t.cols.result}</TableHead>
                <TableHead>{t.cols.origin}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const result = t.results[r.result]
                const details = describe(r.details)
                return (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-quiet">{DATE.format(new Date(r.createdAt))}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs" title={r.actorLabel}>{r.actorLabel}</TableCell>
                    <TableCell className="text-xs">
                      {r.label}
                      {details && <span className="mt-0.5 block text-[11px] text-quiet">{details}</span>}
                    </TableCell>
                    <TableCell>{result ? <Badge tone={result.tone}>{result.label}</Badge> : <span className="text-xs text-quiet">{r.result}</span>}</TableCell>
                    <TableCell className="text-xs text-quiet">{[r.userAgent, r.ipPrefix].filter(Boolean).join(' · ') || '-'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {next && (
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void load(next)} className="text-accent hover:text-accent-strong">
          {loading && spinner} {t.more}
        </Button>
      )}
    </div>
  )
}

/** Full export of the workspace (RGPD): built in the background, kept 7 days. */
function WorkspaceExports() {
  const stepUpApi = useApi()
  const [rows, setRows] = useState<WorkspaceExport[] | null>(null)
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    try { setRows((await api.call('workspace.listExports', {})).exports) } catch { /* keep the list */ }
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
    try {
      await stepUpApi.call('workspace.requestExport', {})
    } catch (err) {
      setAsking(false)
      toast.error(errorMessage(err, t.exportFailed))
      return
    }
    setAsking(false)
    toast.success(t.exportStarted)
    await load()
  }

  // The download is a navigation: the session is verified first.
  async function download(e: React.MouseEvent<HTMLAnchorElement>) {
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

  return (
    <div className="space-y-4">
      <SectionHead
        title={<><Archive className="h-4 w-4 text-accent" aria-hidden="true" /> {t.exportsTitle}</>}
        action={
          <Button type="button" size="sm" disabled={asking || pending} onClick={() => void ask()} className="text-xs">
            {(asking || pending) && spinner}
            {pending ? t.exportPending : t.exportAll}
          </Button>
        }
      >
        {t.exportsBody}
      </SectionHead>
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <span className="font-mono tabular-nums text-ink">{DATE.format(new Date(r.createdAt))}</span>
              {r.status === 'READY' && r.url ? (
                <a href={r.url} onClick={(e) => void download(e)} className="inline-flex items-center gap-1.5 rounded-md text-accent underline-offset-2 hover:underline">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> {t.download(size(r.sizeBytes))}
                  <span className="text-quiet">{t.expires(DATE.format(new Date(r.expiresAt)))}</span>
                </a>
              ) : r.status === 'PENDING' ? (
                <Badge tone="signal" live>{t.preparing}</Badge>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Badge tone="danger">{t.failed}</Badge>
                  <span className="text-quiet">{t.relaunch}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Owner only (the API answers 403 to others, and the zone stays hidden). */
function WorkspaceDeletion() {
  const stepUpApi = useApi()
  const [state, setState] = useState<DeletionState | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setState(await api.call('workspace.getDeletion', {})) } catch { /* not the owner: hidden */ }
  }, [])
  useEffect(() => { void load() }, [load])
  if (!state) return null

  async function send(kind: 'schedule' | 'cancel') {
    setBusy(true)
    try {
      if (kind === 'schedule') {
        const data = await stepUpApi.call('workspace.scheduleDeletion', { body: { confirmName } })
        toast.success(t.deletionScheduled(data.pausedCampaigns ?? 0))
      } else {
        await stepUpApi.call('workspace.cancelDeletion', {})
        toast.success(t.deletionCancelled)
      }
    } catch (err) {
      setBusy(false)
      toast.error(errorMessage(err, t.deletionRefused))
      return
    }
    setBusy(false)
    setConfirmName('')
    await load()
  }

  if (state.scheduledFor) {
    return (
      <Panel className="border-danger/40">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold text-danger">
          <Trash2 className="h-4 w-4" aria-hidden="true" /> {t.scheduledTitle}
        </h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink">
          {t.scheduledBefore}<strong>{DAY.format(new Date(state.scheduledFor))}</strong>{t.scheduledAfter}
        </p>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void send('cancel')} className="mt-4 text-xs">
          {busy && spinner} {t.cancelDeletion}
        </Button>
      </Panel>
    )
  }

  const matches = confirmName.trim() === state.workspaceName.trim()
  return (
    <Panel className="border-danger/30">
      <SectionHead title={<><Trash2 className="h-4 w-4 text-danger" aria-hidden="true" /> {t.deleteTitle}</>}>
        {t.deleteBody(state.graceDays)}
      </SectionHead>
      <label htmlFor="confirm-workspace-name" className="mt-4 block text-xs text-quiet">
        {t.confirmName}<strong className="text-ink">{state.workspaceName}</strong>
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input
          id="confirm-workspace-name"
          size="sm"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoComplete="off"
          className="min-w-[220px] flex-1 focus:border-danger"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!matches || busy}
          onClick={() => void send('schedule')}
          className="border-danger/60 text-xs text-danger hover:border-danger hover:bg-danger/10 hover:text-danger"
        >
          {busy && spinner} {t.scheduleDeletion}
        </Button>
      </div>
    </Panel>
  )
}

export function SecuritySettings() {
  const [state, setState] = useState<SecurityState | null>(null)

  useEffect(() => {
    void (async () => {
      try { setState(await api.call('security.getSettings', {})) } catch { toast.error(t.loadFailed) }
    })()
  }, [])

  return (
    <div className="space-y-4">
      <Panel>
        {state ? <TwoFactorOption state={state} onChange={setState} /> : <Skeleton className="h-20" />}
      </Panel>
      <Panel><WorkspaceExports /></Panel>
      <Panel><AuditLog /></Panel>
      <WorkspaceDeletion />
    </div>
  )
}
