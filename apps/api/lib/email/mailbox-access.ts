/**
 * Mailbox rules shared by the connect flows and the campaign sender choice:
 * how many sending mailboxes a plan allows, and which mailbox / alias a
 * campaign may send as.
 */

import type { Plan, PrismaClient } from '@prisma/client'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { normalizeEmail, parseAliases, providerSupportsAliases } from './sender-identity'
import { seesWholeWorkspace } from '@/lib/auth/permissions'

type Db = Pick<PrismaClient, 'workspace' | 'connectedMailbox'>

export interface MailboxQuota {
  plan: Plan
  planName: string
  limit: number
  used: number
}

export async function mailboxQuota(db: Db, workspaceId: string): Promise<MailboxQuota> {
  const [workspace, used] = await Promise.all([
    db.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } }),
    db.connectedMailbox.count({ where: { workspaceId } }),
  ])
  const plan = workspace?.plan ?? 'FREE'
  return { plan, planName: PLAN_CONFIG[plan].name, limit: PLAN_CONFIG[plan].mailboxLimit, used }
}

export type ConnectCheck =
  | { allowed: true }
  | { allowed: false; message: string; quota: MailboxQuota }
  | { allowed: false; message: string; taken: true }

type TxClient = Pick<PrismaClient, 'workspace' | 'connectedMailbox' | '$executeRaw'>
type QuotaDb = Db & { $transaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T> }

/**
 * The address a mailbox is stored under: the existing row's spelling when
 * this workspace already has the mailbox (whatever its case), else lowercase.
 * Providers return addresses in varying case; one account is one mailbox.
 */
export async function canonicalMailboxEmail(db: Db, workspaceId: string, email: string): Promise<string> {
  const existing = await db.connectedMailbox.findFirst({
    where:  { workspaceId, email: { equals: email.trim(), mode: 'insensitive' } },
    select: { email: true },
  })
  return existing?.email ?? email.trim().toLowerCase()
}

/** Who is connecting: a member may only reconnect a mailbox that is theirs. */
export interface Connector {
  userId: string
  /** OWNER / ADMIN: may reconnect any mailbox of the workspace (they hold its credentials). */
  managesAll: boolean
}

export function connectorOf(ctx: { userId: string; role: Parameters<typeof seesWholeWorkspace>[0] }): Connector {
  return { userId: ctx.userId, managesAll: seesWholeWorkspace(ctx.role) }
}

export const MAILBOX_TAKEN_MESSAGE =
  'Cette adresse est déjà connectée par un autre membre de l’espace. Demandez-lui de la partager, ou à un admin.'

async function checkQuota(db: Db, workspaceId: string, email: string, by: Connector): Promise<ConnectCheck> {
  const existing = await db.connectedMailbox.findFirst({
    where:  { workspaceId, email: { equals: email, mode: 'insensitive' } },
    select: { id: true, ownerUserId: true },
  })
  if (existing) {
    // Reconnecting replaces the credentials: never someone else's mailbox
    // with another account's tokens, unless an admin does it.
    if (existing.ownerUserId === by.userId || by.managesAll) return { allowed: true }
    return { allowed: false, taken: true, message: MAILBOX_TAKEN_MESSAGE }
  }
  const quota = await mailboxQuota(db, workspaceId)
  if (quota.used < quota.limit) return { allowed: true }
  return { allowed: false, quota, message: mailboxLimitMessage(quota) }
}

/**
 * Whether this address may be connected. Reconnecting a mailbox already in
 * the workspace is allowed to its owner and to admins (it replaces its
 * credentials); a new one needs room in the plan. Workspaces above their
 * limit keep their mailboxes.
 */
export async function canConnectMailbox(db: Db, workspaceId: string, email: string, by: Connector): Promise<ConnectCheck> {
  return checkQuota(db, workspaceId, email, by)
}

/**
 * Checks the quota and writes the mailbox in one transaction, under an
 * advisory lock per workspace: two connections at once cannot both pass a
 * count taken before either was saved.
 */
export async function connectWithinQuota<T>(
  db: QuotaDb,
  workspaceId: string,
  email: string,
  by: Connector,
  write: (tx: TxClient) => Promise<T>,
): Promise<{ allowed: true; result: T } | { allowed: false; message: string; taken: boolean }> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mailbox-quota:${workspaceId}`}))`
    const check = await checkQuota(tx, workspaceId, email, by)
    if (!check.allowed) return { allowed: false as const, message: check.message, taken: 'taken' in check }
    return { allowed: true as const, result: await write(tx) }
  })
}

export function mailboxLimitMessage(quota: Pick<MailboxQuota, 'planName' | 'limit'>): string {
  const boxes = `${quota.limit} boîte${quota.limit > 1 ? 's' : ''} d'envoi`
  return `Votre plan ${quota.planName} inclut ${boxes}. Déconnectez une boîte ou passez au plan supérieur pour en ajouter une.`
}

// ─── Campaign sender ──────────────────────────────────────────────────────────

export interface SenderChoiceInput {
  mailboxId: string | null | undefined
  fromAlias: string | null | undefined
}

export type SenderChoice =
  | { ok: true; mailboxId: string | null; fromAlias: string | null }
  | { ok: false; error: string }

/** The campaign a sender is chosen for: its workspace and the member who runs it. */
export interface SenderFor {
  workspaceId: string
  /** The campaign owner, not the person editing: an admin picks among the owner's mailboxes. */
  ownerUserId: string
}

/**
 * Validates a campaign's « Envoyer depuis »: the mailbox must belong to the
 * workspace, serve the campaign's owner (theirs, or shared with the team) and
 * be connected, and an alias must be one of its current aliases. No mailbox
 * means the default one serving that owner.
 */
export async function validateSenderChoice(db: Db, campaign: SenderFor, input: SenderChoiceInput): Promise<SenderChoice> {
  const mailboxId = input.mailboxId || null
  const wantedAlias = input.fromAlias ? normalizeEmail(input.fromAlias) : null
  if (input.fromAlias && !wantedAlias) return { ok: false, error: 'Adresse d’envoi invalide.' }

  if (!mailboxId) {
    if (wantedAlias) return { ok: false, error: 'Choisissez la boîte de cet alias.' }
    return { ok: true, mailboxId: null, fromAlias: null }
  }

  const mailbox = await db.connectedMailbox.findFirst({
    where: {
      id: mailboxId,
      workspaceId: campaign.workspaceId,
      OR: [{ ownerUserId: campaign.ownerUserId }, { sharedWithTeam: true }],
    },
    select: { id: true, email: true, provider: true, status: true, sendAsAliases: true },
  })
  if (!mailbox) return { ok: false, error: 'Boîte d’envoi introuvable.' }
  if (mailbox.status !== 'CONNECTED') {
    return { ok: false, error: `La boîte ${mailbox.email} est déconnectée : reconnectez-la avant de l’utiliser.` }
  }

  if (!wantedAlias || wantedAlias === mailbox.email.toLowerCase()) {
    return { ok: true, mailboxId: mailbox.id, fromAlias: null }
  }
  const usable = providerSupportsAliases(mailbox.provider)
    && parseAliases(mailbox.sendAsAliases).some((alias) => alias.email === wantedAlias)
  if (!usable) return { ok: false, error: `${wantedAlias} n’est pas un alias de ${mailbox.email}.` }
  return { ok: true, mailboxId: mailbox.id, fromAlias: wantedAlias }
}

// ─── Disconnecting ────────────────────────────────────────────────────────────

type DisconnectDb = Pick<PrismaClient, 'campaign' | 'connectedMailbox' | '$transaction'>

export type DisconnectResult =
  | { ok: true; pausedCampaigns: number }
  | { ok: false; inUse: { names: string[]; total: number } }

/**
 * Removes a mailbox. A campaign tied to it must never quietly continue from
 * another sender: without `force` the caller gets the campaigns using it; with
 * it, active ones are paused and lose their sender, to be chosen again.
 */
export async function disconnectMailbox(db: DisconnectDb, workspaceId: string, mailboxId: string, force: boolean): Promise<DisconnectResult> {
  const inUse = await db.campaign.findMany({
    where:  { workspaceId, connectedMailboxId: mailboxId, status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } },
    select: { name: true },
    take:   50,
  })
  if (inUse.length > 0 && !force) {
    return { ok: false, inUse: { names: inUse.slice(0, 10).map((c) => c.name), total: inUse.length } }
  }
  const [paused] = await db.$transaction([
    db.campaign.updateMany({ where: { workspaceId, connectedMailboxId: mailboxId, status: 'ACTIVE' }, data: { status: 'PAUSED' } }),
    db.campaign.updateMany({
      where: { workspaceId, connectedMailboxId: mailboxId },
      data:  { connectedMailboxId: null, fromAlias: null, senderLostAt: new Date() },
    }),
    db.connectedMailbox.deleteMany({ where: { id: mailboxId, workspaceId } }),
  ])
  return { ok: true, pausedCampaigns: paused.count }
}

/**
 * Shares a mailbox with the team, or takes it back. Taking it back stops the
 * other members' campaigns that send from it the same way a removal does:
 * paused, sender to choose again, never quietly moved to another address.
 */
export async function setMailboxSharing(
  db: DisconnectDb,
  workspaceId: string,
  mailboxId: string,
  shared: boolean,
): Promise<{ ok: true; pausedCampaigns: number } | { ok: false }> {
  const mailbox = await db.connectedMailbox.findFirst({ where: { id: mailboxId, workspaceId }, select: { ownerUserId: true } })
  if (!mailbox) return { ok: false }
  if (shared) {
    await db.connectedMailbox.updateMany({ where: { id: mailboxId, workspaceId }, data: { sharedWithTeam: true } })
    return { ok: true, pausedCampaigns: 0 }
  }
  const others = { workspaceId, connectedMailboxId: mailboxId, ownerUserId: { not: mailbox.ownerUserId } }
  const [, paused] = await db.$transaction([
    db.connectedMailbox.updateMany({ where: { id: mailboxId, workspaceId }, data: { sharedWithTeam: false } }),
    db.campaign.updateMany({ where: { ...others, status: 'ACTIVE' }, data: { status: 'PAUSED' } }),
    db.campaign.updateMany({ where: others, data: { connectedMailboxId: null, fromAlias: null, senderLostAt: new Date() } }),
  ])
  return { ok: true, pausedCampaigns: paused.count }
}

/** Shown when a campaign whose mailbox was removed is resumed or launched. */
export const SENDER_REQUIRED_MESSAGE =
  'La boîte d’envoi de cette campagne a été supprimée : choisissez un expéditeur sur la page de la campagne avant de la relancer.'
