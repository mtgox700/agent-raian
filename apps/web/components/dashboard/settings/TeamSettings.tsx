'use client'

/**
 * Paramètres › Équipe: members and roles, invitations, seats of the plan.
 * The server decides every right (lib/team/rules); this screen only hides
 * what the viewer cannot do and explains refusals.
 */

import { useCallback, useEffect, useState } from 'react'
import { Copy, Loader2, LogOut, Mail, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { WorkspaceRole } from '@prisma/client'
import { useStepUp } from '@/lib/auth/use-step-up'

interface Member { userId: string; name: string | null; email: string; role: WorkspaceRole }
interface Invitation { id: string; email: string; role: WorkspaceRole; expiresAt: string }
interface Team {
  members: Member[]
  invitations: Invitation[]
  seats: { used: number; limit: number | null; planName: string }
  me: { userId: string; role: WorkspaceRole; managesTeam: boolean }
}

const ROLE_LABEL: Record<WorkspaceRole, string> = { OWNER: 'Propriétaire', ADMIN: 'Admin', MEMBER: 'Membre', VIEWER: 'Lecture seule' }
const ROLE_HINT: Record<WorkspaceRole, string> = {
  OWNER:  'Tout, y compris la facturation et la suppression.',
  ADMIN:  'Tout l’espace et l’équipe, sauf la facturation.',
  MEMBER: 'Ses campagnes, leurs leads et ses boîtes.',
  VIEWER: 'Lit tout, ne modifie rien.',
}
const HIGH: WorkspaceRole[] = ['OWNER', 'ADMIN']

const field = 'rounded-md border border-border bg-void px-3 py-2 text-sm text-white placeholder:text-muted/60 transition-colors duration-150 ease-signal focus:border-cyan/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40'
const primary = 'inline-flex items-center justify-center gap-1.5 rounded-md bg-cyan px-3 py-2 text-sm font-semibold text-void transition-colors duration-150 ease-signal hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:opacity-40'
const ghost = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors duration-150 ease-signal hover:bg-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-40'

async function call(url: string, init: RequestInit, send: typeof fetch = fetch): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await send(url, { ...init, headers: { 'Content-Type': 'application/json' } })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  return { ok: res.ok, data }
}

export function TeamSettings() {
  const { stepUpFetch } = useStepUp()
  const [team, setTeam] = useState<Team | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('MEMBER')
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/team')
    if (res.ok) setTeam(await res.json() as Team)
    else toast.error('Impossible de charger l’équipe. Rechargez la page.')
  }, [])
  useEffect(() => { void load() }, [load])

  if (!team) return <div className="h-40 motion-safe:animate-pulse rounded-[10px] border border-border bg-surface" />
  const { me, seats } = team
  const isOwner = me.role === 'OWNER'
  const full = seats.limit !== null && seats.used >= seats.limit
  const owners = team.members.filter((m) => m.role === 'OWNER').length
  // The last owner cannot leave: no button that could only be refused.
  const canLeave = (m: Member) => m.userId === me.userId && !(m.role === 'OWNER' && owners <= 1)
  const canEdit = (m: Member) => me.managesTeam && m.userId !== me.userId && (isOwner || !HIGH.includes(m.role))
  const roleChoices = (m: Member): WorkspaceRole[] => (isOwner ? ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] : HIGH.includes(m.role) ? [m.role] : ['MEMBER', 'VIEWER'])

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setBusy('invite')
    const { ok, data } = await call('/api/team/invitations', { method: 'POST', body: JSON.stringify({ email, role }) })
    setBusy(null)
    if (!ok) { toast.error(String(data.error ?? 'Invitation refusée.')); return }
    setEmail('')
    setLastLink(String(data.url))
    toast.success(data.emailSent ? `Invitation envoyée à ${String(data.email)}` : 'Invitation créée : l’e-mail n’est pas parti, partagez le lien ci-dessous.')
    await load()
  }

  async function changeRole(m: Member, next: WorkspaceRole) {
    setBusy(m.userId)
    const { ok, data } = await call(`/api/team/members/${m.userId}`, { method: 'PATCH', body: JSON.stringify({ role: next }) }, stepUpFetch as typeof fetch)
    setBusy(null)
    if (ok) toast.success(`${m.name || m.email} : ${ROLE_LABEL[next].toLowerCase()}`)
    else toast.error(String(data.error ?? 'Changement refusé.'))
    await load()
  }

  async function revoke(inv: Invitation) {
    setBusy(inv.id)
    const { ok } = await call(`/api/team/invitations/${inv.id}`, { method: 'DELETE' })
    setBusy(null)
    if (ok) {
      toast.success('Invitation annulée')
      setLastLink(null)
    }
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-white">Équipe</h3>
          <p className="mt-0.5 text-xs text-muted">Chacun travaille ses campagnes ; les admins voient tout l’espace.</p>
        </div>
        <p className="font-mono text-xs tabular-nums text-muted">
          {seats.limit === null
            ? `${seats.used} siège${seats.used > 1 ? 's' : ''} utilisé${seats.used > 1 ? 's' : ''} · illimités (plan ${seats.planName})`
            : `${seats.used} / ${seats.limit} siège${seats.limit > 1 ? 's' : ''} (plan ${seats.planName})`}
        </p>
      </div>

      <ul className="divide-y divide-border rounded-[10px] border border-border">
        {team.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-surface font-display text-xs font-semibold text-white" aria-hidden="true">
              {(m.name || m.email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{m.name || m.email}{m.userId === me.userId && <span className="text-muted"> (vous)</span>}</p>
              <p className="truncate text-xs text-muted">{m.email}</p>
            </div>
            {canEdit(m) ? (
              <select
                aria-label={`Rôle de ${m.name || m.email}`}
                value={m.role}
                disabled={busy === m.userId}
                onChange={(e) => void changeRole(m, e.target.value as WorkspaceRole)}
                className={`${field} py-1 text-xs`}
              >
                {roleChoices(m).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            ) : (
              <span className="text-xs text-muted" title={ROLE_HINT[m.role]}>{ROLE_LABEL[m.role]}</span>
            )}
            {(canEdit(m) || canLeave(m)) && (
              <button type="button" className={ghost} onClick={() => setRemoving(m)} disabled={busy === m.userId}>
                {m.userId === me.userId ? <><LogOut className="h-3 w-3" aria-hidden="true" /> Quitter</> : <><Trash2 className="h-3 w-3" aria-hidden="true" /> Retirer</>}
              </button>
            )}
          </li>
        ))}
      </ul>

      {removing && (
        <RemovePanel
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
              <p className="text-xs font-medium text-muted">Invitations en attente</p>
              {team.invitations.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
                  <Mail className="h-3 w-3 text-muted" aria-hidden="true" />
                  <span className="flex-1 truncate text-white">{inv.email}</span>
                  <span className="text-muted">{ROLE_LABEL[inv.role]}</span>
                  <span className="text-muted">jusqu’au {new Date(inv.expiresAt).toLocaleDateString('fr-FR')}</span>
                  <button type="button" className={ghost} onClick={() => void revoke(inv)} disabled={busy === inv.id}>Annuler</button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={invite} className="space-y-2 rounded-[10px] border border-border bg-void p-3">
            <p className="text-xs font-medium text-white">Inviter quelqu’un</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@entreprise.fr" aria-label="E-mail de la personne à inviter"
                className={`${field} min-w-0 flex-1`}
              />
              <select aria-label="Rôle" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)} className={field}>
                {(isOwner ? ['ADMIN', 'MEMBER', 'VIEWER'] as WorkspaceRole[] : ['MEMBER', 'VIEWER'] as WorkspaceRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
              <button type="submit" className={primary} disabled={busy === 'invite' || full}>
                {busy === 'invite' ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />} Inviter
              </button>
            </div>
            <p className="text-[11px] text-muted">{ROLE_HINT[role]} Le lien est personnel, à usage unique, valable 7 jours.</p>
            {full && <p className="text-[11px] text-warning">Tous les sièges de votre plan sont pris : retirez un membre ou une invitation, ou passez au plan supérieur.</p>}
            {lastLink && (
              <div className="flex items-center gap-2 rounded-md bg-void px-2 py-1.5">
                <code className="flex-1 truncate text-[11px] text-white">{lastLink}</code>
                <button type="button" className={ghost} onClick={() => { void navigator.clipboard.writeText(lastLink); toast.success('Lien copié') }}>
                  <Copy className="h-3 w-3" aria-hidden="true" /> Copier
                </button>
              </div>
            )}
          </form>
        </>
      )}
    </div>
  )
}

function RemovePanel({ member, isMe, successors, onClose, onDone }: {
  member: Member
  isMe: boolean
  successors: Member[]
  onClose: () => void
  onDone: (left: boolean) => Promise<void>
}) {
  const { stepUpFetch } = useStepUp()
  const [transferTo, setTransferTo] = useState('')
  const [pending, setPending] = useState(false)
  const who = isMe ? 'Vos' : `Les`

  async function confirmRemoval() {
    setPending(true)
    const query = transferTo ? `?transferTo=${encodeURIComponent(transferTo)}` : ''
    const { ok, data } = await call(`/api/team/members/${member.userId}${query}`, { method: 'DELETE' }, stepUpFetch as typeof fetch)
    setPending(false)
    if (!ok) { toast.error(String(data.error ?? 'Retrait refusé.')); return }
    const paused = Number(data.pausedCampaigns ?? 0)
    toast.success(isMe ? 'Vous avez quitté l’espace' : `${member.name || member.email} a été retiré${paused > 0 ? ` : ${paused} campagne${paused > 1 ? 's' : ''} en pause` : ''}`)
    await onDone(isMe)
  }

  return (
    <div role="dialog" aria-label={isMe ? 'Quitter l’espace' : 'Retirer un membre'} className="space-y-3 rounded-[10px] border border-warning/30 bg-obsidian p-4">
      <p className="text-sm font-medium text-white">{isMe ? 'Quitter cet espace ?' : `Retirer ${member.name || member.email} ?`}</p>
      <label className="block space-y-1 text-xs text-white">
        <span>{who} campagnes, boîtes et comptes LinkedIn :</span>
        <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className={`${field} w-full`}>
          <option value="">Mettre les campagnes en pause et retirer les boîtes</option>
          {successors.map((s) => <option key={s.userId} value={s.userId}>Transférer à {s.name || s.email} ({ROLE_LABEL[s.role].toLowerCase()})</option>)}
        </select>
      </label>
      <p className="text-[11px] text-muted">
        {transferTo
          ? 'Tout passe à cette personne tel quel : les campagnes continuent depuis les mêmes boîtes.'
          : 'Les campagnes reviennent au propriétaire de l’espace, en pause : rien ne repart sous une autre identité sans décision.'}
      </p>
      <div className="flex gap-2">
        <button type="button" className={primary} onClick={() => void confirmRemoval()} disabled={pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />} {isMe ? 'Quitter' : 'Retirer'}
        </button>
        <button type="button" className={ghost} onClick={onClose}>Annuler</button>
      </div>
    </div>
  )
}
