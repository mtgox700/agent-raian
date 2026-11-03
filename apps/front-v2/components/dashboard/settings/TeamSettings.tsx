'use client'

/**
 * Paramètres › Équipe: members and roles, invitations, seats of the plan.
 * The server decides every right; this screen only hides what the viewer
 * cannot do and explains refusals.
 */
import { useCallback, useEffect, useId, useState } from 'react'
import { Copy, Loader2, LogOut, Mail, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Input, Select, Skeleton } from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { settingsPage, teamCopy as t } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import { useApi } from '@/lib/front/use-api'
import type { TeamInvitation, TeamMember, TeamState, WorkspaceRole } from '@/lib/front/types-settings'
import { errorMessage } from './ui'

const HIGH: WorkspaceRole[] = ['OWNER', 'ADMIN']
const ghost = 'h-8 px-2 text-xs'
const who = (m: TeamMember) => m.name || m.email

export function TeamSettings() {
  const stepUpApi = useApi()
  const [team, setTeam] = useState<TeamState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER')
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  const load = useCallback(async () => {
    try { setTeam(await api.call('team.list', {})) } catch { toast.error(t.loadFailed) }
  }, [])
  useEffect(() => { void load() }, [load])

  if (!team) {
    return (
      <div aria-busy="true" aria-label={settingsPage.loading}>
        <Skeleton className="h-40 rounded-md border border-line" />
      </div>
    )
  }

  const { me, seats } = team
  const isOwner = me.role === 'OWNER'
  const full = seats.limit !== null && seats.used >= seats.limit
  const owners = team.members.filter((m) => m.role === 'OWNER').length
  // The last owner cannot leave: no button that could only be refused.
  const canLeave = (m: TeamMember) => m.userId === me.userId && !(m.role === 'OWNER' && owners <= 1)
  const canEdit = (m: TeamMember) => me.managesTeam && m.userId !== me.userId && (isOwner || !HIGH.includes(m.role))
  const roleChoices = (m: TeamMember): WorkspaceRole[] =>
    isOwner ? ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] : HIGH.includes(m.role) ? [m.role] : ['MEMBER', 'VIEWER']
  const invitable: ('ADMIN' | 'MEMBER' | 'VIEWER')[] = isOwner ? ['ADMIN', 'MEMBER', 'VIEWER'] : ['MEMBER', 'VIEWER']

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setBusy('invite')
    try {
      const data = await api.call('team.invite', { body: { email, role } })
      setEmail('')
      setLastLink(data.url)
      toast.success(data.emailSent ? t.invited(data.email) : t.inviteNoMail)
    } catch (err) {
      toast.error(errorMessage(err, t.inviteRefused))
      return
    } finally {
      setBusy(null)
    }
    await load()
  }

  async function changeRole(m: TeamMember, next: WorkspaceRole) {
    setBusy(m.userId)
    try {
      await stepUpApi.call('team.changeRole', { params: { userId: m.userId }, body: { role: next } })
      toast.success(t.roleChanged(who(m), t.roles[next]))
    } catch (err) {
      toast.error(errorMessage(err, t.roleRefused))
    }
    setBusy(null)
    await load()
  }

  async function revoke(inv: TeamInvitation) {
    setBusy(inv.id)
    try {
      await api.call('team.revokeInvitation', { params: { invitationId: inv.id } })
      toast.success(t.revoked)
      setLastLink(null)
    } catch { /* the list below says what is still pending */ }
    setBusy(null)
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-ink">{t.title}</h3>
          <p className="mt-1 text-sm text-quiet">{t.subtitle}</p>
        </div>
        <p className="font-mono text-xs tabular-nums text-quiet">{t.seats(seats.used, seats.limit, seats.planName)}</p>
      </div>

      <ul className="divide-y divide-line rounded-md border border-line">
        {team.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface font-display text-xs font-semibold text-ink" aria-hidden="true">
              {who(m).charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{who(m)}{m.userId === me.userId && <span className="text-quiet">{t.you}</span>}</p>
              <p className="truncate text-xs text-quiet">{m.email}</p>
            </div>
            {canEdit(m) ? (
              <Select
                size="sm"
                aria-label={t.roleOf(who(m))}
                value={m.role}
                disabled={busy === m.userId}
                onChange={(e) => void changeRole(m, e.target.value as WorkspaceRole)}
                wrapperClassName="w-40"
                className="text-xs"
              >
                {roleChoices(m).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
              </Select>
            ) : (
              <span className="text-xs text-quiet" title={t.hints[m.role]}>{t.roles[m.role]}</span>
            )}
            {(canEdit(m) || canLeave(m)) && (
              <Button type="button" variant="ghost" size="sm" className={ghost} onClick={() => setRemoving(m)} disabled={busy === m.userId}>
                {m.userId === me.userId
                  ? <><LogOut className="h-3 w-3" aria-hidden="true" /> {t.leave}</>
                  : <><Trash2 className="h-3 w-3" aria-hidden="true" /> {t.remove}</>}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {removing && (
        <RemoveDialog
          member={removing}
          isMe={removing.userId === me.userId}
          successors={team.members.filter((m) => HIGH.includes(m.role) && m.userId !== removing.userId)}
          onClose={() => setRemoving(null)}
          onDone={async (left) => {
            setRemoving(null)
            if (left) { window.location.href = '/dashboard'; return }
            await load()
          }}
        />
      )}

      {me.managesTeam && (
        <>
          {team.invitations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-quiet">{t.pending}</p>
              <ul className="space-y-1.5">
                {team.invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-xs">
                    <Mail className="h-3 w-3 text-quiet" aria-hidden="true" />
                    <span className="flex-1 truncate text-ink">{inv.email}</span>
                    <span className="text-quiet">{t.roles[inv.role]}</span>
                    <span className="text-quiet">{t.until(new Date(inv.expiresAt).toLocaleDateString('fr-FR'))}</span>
                    <Button type="button" variant="ghost" size="sm" className={ghost} onClick={() => void revoke(inv)} disabled={busy === inv.id}>
                      {t.cancel}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={invite} className="space-y-2 rounded-md border border-line bg-canvas p-3">
            <p className="text-xs font-medium text-ink">{t.inviteTitle}</p>
            <div className="flex flex-wrap gap-2">
              <Input
                size="sm"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.invitePlaceholder}
                aria-label={t.inviteEmail}
                className="min-w-0 flex-1 basis-56"
              />
              <Select size="sm" aria-label={t.role} value={role} onChange={(e) => setRole(e.target.value as typeof role)} wrapperClassName="w-40">
                {invitable.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
              </Select>
              <Button type="submit" size="sm" disabled={busy === 'invite' || full}>
                {busy === 'invite'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  : <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />}
                {t.invite}
              </Button>
            </div>
            <p className="text-[11px] text-quiet">{t.hints[role]} {t.linkNote}</p>
            {full && <p className="text-[11px] text-warning">{t.full}</p>}
            {lastLink && (
              <div className="flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1.5">
                <code className="flex-1 truncate font-mono text-[11px] text-ink">{lastLink}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={ghost}
                  onClick={() => { void navigator.clipboard.writeText(lastLink); toast.success(t.copied) }}
                >
                  <Copy className="h-3 w-3" aria-hidden="true" /> {t.copy}
                </Button>
              </div>
            )}
          </form>
        </>
      )}
    </div>
  )
}

function RemoveDialog({ member, isMe, successors, onClose, onDone }: {
  member: TeamMember
  isMe: boolean
  successors: TeamMember[]
  onClose: () => void
  onDone: (left: boolean) => Promise<void>
}) {
  const stepUpApi = useApi()
  const id = useId()
  const [transferTo, setTransferTo] = useState('')
  const [pending, setPending] = useState(false)

  async function confirmRemoval() {
    setPending(true)
    try {
      const data = await stepUpApi.call('team.removeMember', {
        params: { userId: member.userId },
        query: { transferTo: transferTo || undefined },
      })
      toast.success(isMe ? t.left : t.removed(who(member), data.pausedCampaigns ?? 0))
      setPending(false)
      await onDone(isMe)
    } catch (err) {
      setPending(false)
      toast.error(errorMessage(err, t.removeRefused))
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!pending) onClose() }}
      title={isMe ? t.leaveQuestion : t.removeQuestion(who(member))}
      closeLabel={t.cancel}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>{t.cancel}</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void confirmRemoval()}
            disabled={pending}
            className="border-danger/50 text-danger hover:border-danger hover:text-danger"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {isMe ? t.leave : t.remove}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label htmlFor={`${id}-transfer`} className="block text-sm text-ink">{t.resources(isMe)}</label>
        <Select id={`${id}-transfer`} size="sm" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
          <option value="">{t.pauseOption}</option>
          {successors.map((s) => <option key={s.userId} value={s.userId}>{t.transferOption(who(s), t.roles[s.role])}</option>)}
        </Select>
        <p className="text-xs leading-relaxed text-quiet">{transferTo ? t.transferNote : t.pauseNote}</p>
      </div>
    </Dialog>
  )
}
