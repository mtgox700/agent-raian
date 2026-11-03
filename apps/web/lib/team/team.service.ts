/**
 * The team of a workspace: seats, invitations, roles, departures. Every
 * change runs in one transaction under an advisory lock per workspace, so two
 * admins acting at once cannot both take the last seat, nor both remove one
 * of the last two owners.
 */

import type { Prisma, PrismaClient, WorkspaceRole } from '@prisma/client'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import type { AccessContext } from '@/lib/auth/access'
import { normalizeEmail } from '@/lib/email/sender-identity'
import { canChangeRole, canInvite, canReceiveTransfer, canRemove, TEAM_REFUSALS, type TeamRefusal } from './rules'
import { hashInvitationToken, INVITATION_TTL_MS, newInvitationToken } from './invitation-link'
import { handOverMemberResources, transferMemberResources } from './hand-over'

type Tx = Prisma.TransactionClient
type Actor = Pick<AccessContext, 'workspaceId' | 'userId' | 'role'>

export type TeamError = TeamRefusal
  | 'NO_SEAT' | 'INVALID_EMAIL' | 'ALREADY_MEMBER' | 'NOT_FOUND'
  | 'INVITATION_INVALID' | 'WRONG_EMAIL' | 'BAD_SUCCESSOR'
  | 'TOO_SOON' | 'DAILY_LIMIT' | 'ACCOUNT_CONFLICT'

export const TEAM_ERRORS: Record<TeamError, string> = {
  ...TEAM_REFUSALS,
  NO_SEAT:            '',  // built from the plan, see seatMessage
  INVALID_EMAIL:      'Adresse e-mail invalide.',
  ALREADY_MEMBER:     'Cette personne fait déjà partie de l’espace.',
  NOT_FOUND:          'Membre ou invitation introuvable.',
  INVITATION_INVALID: 'Cette invitation n’est plus valable : demandez-en une nouvelle.',
  WRONG_EMAIL:        'Cette invitation a été envoyée à une autre adresse e-mail que celle de votre compte.',
  BAD_SUCCESSOR:      'Choisissez un admin ou un propriétaire de l’espace pour reprendre ses campagnes.',
  TOO_SOON:           'Une invitation vient d’être envoyée à cette adresse : attendez 10 minutes avant de la renvoyer.',
  DAILY_LIMIT:        'Trop d’invitations aujourd’hui pour cet espace : réessayez demain.',
  ACCOUNT_CONFLICT:   'Cette adresse est rattachée à un autre compte Phantera. Écrivez-nous pour la récupérer.',
}

/** One e-mail per address per 10 minutes, 50 invitations a day per workspace: no relay for spam. */
const RESEND_COOLDOWN_MS = 10 * 60 * 1000
const DAILY_INVITATIONS = 50

export type TeamResult<T> = { ok: true; value: T } | { ok: false; error: TeamError; message: string }
const fail = <T>(error: TeamError, message = TEAM_ERRORS[error]): TeamResult<T> => ({ ok: false, error, message })

async function lockTeam(tx: Tx, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team:${workspaceId}`}))`
}

const pendingWhere = (workspaceId: string, now = new Date()): Prisma.WorkspaceInvitationWhereInput =>
  ({ workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } })

// ─── Seats ────────────────────────────────────────────────────────────────────

export interface SeatUsage { used: number; limit: number; planName: string }

/** Members plus pending invitations: an invitation holds its seat until it ends. */
export async function seatUsage(db: Tx | PrismaClient, workspaceId: string): Promise<SeatUsage> {
  const [workspace, members, pending] = await Promise.all([
    db.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } }),
    db.workspaceMember.count({ where: { workspaceId } }),
    db.workspaceInvitation.count({ where: pendingWhere(workspaceId) }),
  ])
  const plan = PLAN_CONFIG[workspace?.plan ?? 'FREE']
  return { used: members + pending, limit: plan.seatLimit, planName: plan.name }
}

export function seatMessage(usage: Pick<SeatUsage, 'limit' | 'planName'>): string {
  const seats = `${usage.limit} siège${usage.limit > 1 ? 's' : ''}`
  return `Votre plan ${usage.planName} inclut ${seats}. Retirez un membre ou une invitation, ou passez au plan supérieur pour agrandir l’équipe.`
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function inviteMember(
  db: PrismaClient,
  actor: Actor,
  input: { email: string; role: WorkspaceRole },
): Promise<TeamResult<{ id: string; token: string; email: string; expiresAt: Date }>> {
  const allowed = canInvite(actor.role, input.role)
  if (!allowed.ok) return fail(allowed.refusal)
  const email = normalizeEmail(input.email)
  if (!email) return fail('INVALID_EMAIL')

  return db.$transaction(async (tx) => {
    await lockTeam(tx, actor.workspaceId)
    const member = await tx.workspaceMember.findFirst({ where: { workspaceId: actor.workspaceId, user: { email: { equals: email, mode: 'insensitive' } } } })
    if (member) return fail('ALREADY_MEMBER')

    const now = Date.now()
    const [recent, today] = await Promise.all([
      tx.workspaceInvitation.findFirst({ where: { workspaceId: actor.workspaceId, email, createdAt: { gt: new Date(now - RESEND_COOLDOWN_MS) } }, select: { id: true } }),
      tx.workspaceInvitation.count({ where: { workspaceId: actor.workspaceId, createdAt: { gt: new Date(now - 24 * 60 * 60 * 1000) } } }),
    ])
    if (recent) return fail('TOO_SOON')
    if (today >= DAILY_INVITATIONS) return fail('DAILY_LIMIT')
    // An admin cannot replace an admin invitation sent by an owner.
    const pending = await tx.workspaceInvitation.findFirst({ where: { ...pendingWhere(actor.workspaceId), email }, select: { role: true } })
    if (pending && !canInvite(actor.role, pending.role).ok) return fail('NOT_ALLOWED')

    // A new invitation to the same address replaces the pending one: it
    // keeps its seat instead of taking a second.
    const replaced = await tx.workspaceInvitation.updateMany({
      where: { ...pendingWhere(actor.workspaceId), email },
      data:  { revokedAt: new Date() },
    })
    const usage = await seatUsage(tx, actor.workspaceId)
    if (replaced.count === 0 && usage.used >= usage.limit) return fail('NO_SEAT', seatMessage(usage))

    const { token, tokenHash } = newInvitationToken()
    const created = await tx.workspaceInvitation.create({
      data: {
        workspaceId: actor.workspaceId, email, role: input.role, tokenHash,
        invitedByUserId: actor.userId, expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: { id: true, email: true, expiresAt: true },
    })
    return { ok: true as const, value: { ...created, token } }
  })
}

export async function revokeInvitation(db: PrismaClient, actor: Actor, invitationId: string): Promise<TeamResult<null>> {
  // Same rank as sending it: an admin cannot cancel an admin invitation.
  const invitation = await db.workspaceInvitation.findFirst({ where: { id: invitationId, ...pendingWhere(actor.workspaceId) }, select: { role: true } })
  if (!invitation) return fail('NOT_FOUND')
  if (!canInvite(actor.role, invitation.role).ok) return fail('NOT_ALLOWED')
  const done = await db.workspaceInvitation.updateMany({
    where: { id: invitationId, ...pendingWhere(actor.workspaceId) },
    data:  { revokedAt: new Date() },
  })
  return done.count === 1 ? { ok: true, value: null } : fail('NOT_FOUND')
}

/** What the invitation page shows before the person accepts. Null when unusable. */
export async function readInvitation(db: PrismaClient, token: string) {
  const tokenHash = hashInvitationToken(token)
  if (!tokenHash) return null
  const invitation = await db.workspaceInvitation.findUnique({
    where:  { tokenHash },
    select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, workspaceId: true, invitedByUserId: true, workspace: { select: { name: true } } },
  })
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) return null
  const inviter = await db.user.findUnique({ where: { id: invitation.invitedByUserId }, select: { name: true, email: true } })
  return { ...invitation, inviterName: inviter?.name || inviter?.email || 'Un membre de l’équipe' }
}

/**
 * Joins the workspace. The account must hold the invited address among its
 * verified e-mails. The plan is checked again (it may have shrunk since the
 * invitation was sent), then the invitation is claimed atomically: used once.
 */
export async function acceptInvitation(
  db: PrismaClient,
  input: { token: string; clerkId: string; verifiedEmails: string[]; name: string | null },
): Promise<TeamResult<{ workspaceId: string; userId: string; invitationId: string; role: WorkspaceRole }>> {
  const tokenHash = hashInvitationToken(input.token)
  if (!tokenHash) return fail('INVITATION_INVALID')
  const verified = input.verifiedEmails.map((e) => normalizeEmail(e)).filter((e): e is string => Boolean(e))

  return db.$transaction(async (tx) => {
    const invitation = await tx.workspaceInvitation.findUnique({ where: { tokenHash } })
    if (!invitation) return fail('INVITATION_INVALID')
    await lockTeam(tx, invitation.workspaceId)
    // A used, cancelled or expired link stops here, before touching any account.
    if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) return fail('INVITATION_INVALID')
    if (!verified.includes(invitation.email)) return fail('WRONG_EMAIL')

    // Every check before the claim: a refusal leaves the invitation usable.
    const user = await ensureUser(tx, input.clerkId, invitation.email, input.name)
    if (!user) return fail('ACCOUNT_CONFLICT')
    const already = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } } })
    if (already) {
      // Already inside: the invitation has no use left, it frees its seat.
      await tx.workspaceInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } })
      return fail('ALREADY_MEMBER')
    }
    // The plan may have shrunk since: this invitation's seat is the one it
    // held, so only the members already in count against it.
    const [members, usage] = await Promise.all([
      tx.workspaceMember.count({ where: { workspaceId: invitation.workspaceId } }),
      seatUsage(tx, invitation.workspaceId),
    ])
    if (members >= usage.limit) return fail('NO_SEAT', seatMessage(usage))

    const claimed = await tx.workspaceInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data:  { acceptedAt: new Date(), acceptedByUserId: user.id },
    })
    if (claimed.count === 0) return fail('INVITATION_INVALID')

    await tx.workspaceMember.create({ data: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role } })
    return { ok: true as const, value: { workspaceId: invitation.workspaceId, userId: user.id, invitationId: invitation.id, role: invitation.role } }
  })
}

/**
 * The account's row, created on first visit (the Clerk webhook may not have
 * run yet). An address already held by another Clerk account is not
 * re-linked here: joining a team never moves someone else's account.
 */
async function ensureUser(tx: Tx, clerkId: string, email: string, name: string | null): Promise<{ id: string } | null> {
  const byClerk = await tx.user.findUnique({ where: { clerkId }, select: { id: true } })
  if (byClerk) return byClerk
  const byEmail = await tx.user.findUnique({ where: { email }, select: { id: true } })
  if (byEmail) return null
  return tx.user.create({ data: { clerkId, email, name }, select: { id: true } })
}

// ─── Roles and departures ─────────────────────────────────────────────────────

async function membership(tx: Tx, workspaceId: string, userId: string) {
  return tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true, role: true } })
}

const countOwners = (tx: Tx, workspaceId: string) => tx.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } })

/** The billing owner leaving the OWNER role hands the workspace to the oldest other owner. */
async function moveBillingOwnerAway(tx: Tx, workspaceId: string, userId: string): Promise<void> {
  const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } })
  if (workspace?.ownerId !== userId) return
  const successor = await tx.workspaceMember.findFirst({
    where: { workspaceId, role: 'OWNER', userId: { not: userId } }, orderBy: { createdAt: 'asc' }, select: { userId: true },
  })
  if (successor) await tx.workspace.update({ where: { id: workspaceId }, data: { ownerId: successor.userId } })
}

export async function changeMemberRole(
  db: PrismaClient,
  actor: Actor,
  input: { userId: string; role: WorkspaceRole },
): Promise<TeamResult<{ previousRole: WorkspaceRole }>> {
  return db.$transaction(async (tx) => {
    await lockTeam(tx, actor.workspaceId)
    const target = await membership(tx, actor.workspaceId, input.userId)
    if (!target) return fail('NOT_FOUND')
    const verdict = canChangeRole({ actor: actor.role, target: target.role, next: input.role, owners: await countOwners(tx, actor.workspaceId) })
    if (!verdict.ok) return fail(verdict.refusal)
    await tx.workspaceMember.update({ where: { id: target.id }, data: { role: input.role } })
    if (target.role === 'OWNER' && input.role !== 'OWNER') await moveBillingOwnerAway(tx, actor.workspaceId, input.userId)
    return { ok: true as const, value: { previousRole: target.role } }
  })
}

/**
 * Removes a member, or lets one leave. With `transferToUserId` (an admin or
 * owner of the workspace) their campaigns, mailboxes and channels go to that
 * person as they are; without, campaigns go to the workspace owner paused
 * and their accounts are removed. Returns the Unipile accounts to revoke.
 */
export async function removeMember(
  db: PrismaClient,
  actor: Actor,
  input: { userId: string; transferToUserId: string | null },
): Promise<TeamResult<{ channelAccounts: string[]; pausedCampaigns: number }>> {
  return db.$transaction(async (tx) => {
    const { workspaceId } = actor
    await lockTeam(tx, workspaceId)
    const target = await membership(tx, workspaceId, input.userId)
    if (!target) return fail('NOT_FOUND')
    const verdict = canRemove({ actor: actor.role, actorIsTarget: actor.userId === input.userId, target: target.role, owners: await countOwners(tx, workspaceId) })
    if (!verdict.ok) return fail(verdict.refusal)

    if (input.transferToUserId) {
      const successor = input.transferToUserId === input.userId ? null : await membership(tx, workspaceId, input.transferToUserId)
      if (!successor || !canReceiveTransfer(successor.role)) return fail('BAD_SUCCESSOR')
    }

    await moveBillingOwnerAway(tx, workspaceId, input.userId)
    let result = { channelAccounts: [] as string[], pausedCampaigns: 0 }
    if (input.transferToUserId) {
      await transferMemberResources(tx, { workspaceId, fromUserId: input.userId, toUserId: input.transferToUserId })
    } else {
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { ownerId: true } })
      const handed = await handOverMemberResources(tx, { workspaceId, fromUserId: input.userId, toUserId: workspace.ownerId })
      result = { channelAccounts: handed.channelAccounts, pausedCampaigns: handed.pausedCampaigns }
    }
    await tx.workspaceMember.delete({ where: { id: target.id } })
    return { ok: true as const, value: result }
  })
}

// ─── Listing ──────────────────────────────────────────────────────────────────

export async function listTeam(db: PrismaClient, workspaceId: string, withInvitations: boolean) {
  const [members, invitations, seats] = await Promise.all([
    db.workspaceMember.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'asc' },
      select:  { role: true, createdAt: true, user: { select: { id: true, name: true, email: true, imageUrl: true } } },
    }),
    withInvitations
      ? db.workspaceInvitation.findMany({
          where:   pendingWhere(workspaceId),
          orderBy: { createdAt: 'desc' },
          select:  { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        })
      : Promise.resolve([]),
    seatUsage(db, workspaceId),
  ])
  return {
    members: members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, imageUrl: m.user.imageUrl, role: m.role, since: m.createdAt })),
    invitations,
    seats: { used: seats.used, limit: Number.isFinite(seats.limit) ? seats.limit : null, planName: seats.planName },
  }
}
