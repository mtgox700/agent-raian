/**
 * GET  /api/mailbox?workspaceId=…: list connected mailboxes
 * DELETE /api/mailbox?id=…&workspaceId=…: disconnect a mailbox
 * PATCH /api/mailbox: set default mailbox, daily cap, warm-up ramp, sharing
 *
 * A member sees their mailboxes and the shared ones, and manages only their
 * own; admins see and manage all, and alone decide what is shared.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { can } from '@/lib/auth/permissions'
import { ownMailboxScope, visibleMailboxScope } from '@/lib/auth/scope'
import { MAX_DAILY_CAP } from '@/lib/deliverability/send-policy'
import { SENT_STATUSES } from '@/lib/sequences/types'
import { disconnectMailbox, mailboxQuota, setMailboxSharing } from '@/lib/email/mailbox-access'
import { parseAliases } from '@/lib/email/sender-identity'
import { requireStepUp } from '@/lib/auth/step-up'
import { recordAudit } from '@/lib/audit/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId requis' }, { status: 400 })

  const workspaceAccess = await requireAccess(userId, 'mailbox.read', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  const mailboxes = await db.connectedMailbox.findMany({
    where:   visibleMailboxScope(workspace),
    select: {
      id: true, provider: true, email: true, displayName: true,
      status: true, isDefault: true, lastSyncAt: true, lastSyncError: true,
      createdAt: true, dailyCap: true, warmupEnabled: true, sendPausedUntil: true,
      sendAsAliases: true, ownerUserId: true, sharedWithTeam: true,
      owner: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Emails sent by each mailbox in the rolling 24h window the cap applies to.
  const sent = mailboxes.length === 0 ? [] : await db.emailSend.groupBy({
    by:     ['mailboxId'],
    where:  {
      mailboxId: { in: mailboxes.map((mb) => mb.id) },
      status:    { in: [...SENT_STATUSES] },
      sentAt:    { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    _count: { _all: true },
  })
  const sentByMailbox = new Map(sent.map((row) => [row.mailboxId, row._count._all]))

  const quota = await mailboxQuota(db, workspaceId)
  const managesAll = can(workspace.role, 'team.manage')
  const list = mailboxes.map(({ sendAsAliases, ownerUserId, owner, ...mb }) => ({
    ...mb,
    ownerName:   owner.name || owner.email,
    canShare:    managesAll,
    aliases:     parseAliases(sendAsAliases),
    sentLast24h: sentByMailbox.get(mb.id) ?? 0,
    mine:        ownerUserId === workspace.userId,
    canManage:   can(workspace.role, 'mailbox.manage') && (managesAll || ownerUserId === workspace.userId),
  }))
  // The list stays the body (existing clients); the plan's mailbox quota
  // travels in headers. -1 = unlimited.
  return NextResponse.json(list, {
    headers: {
      'X-Mailbox-Limit': String(Number.isFinite(quota.limit) ? quota.limit : -1),
      'X-Mailbox-Plan':  encodeURIComponent(quota.planName),
    },
  })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const id          = req.nextUrl.searchParams.get('id')
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!id || !workspaceId) return NextResponse.json({ error: 'id + workspaceId requis' }, { status: 400 })

  const workspaceAccess = await requireAccess(userId, 'mailbox.manage', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // A member removes only their own mailbox; admins any of the workspace.
  const removable = await db.connectedMailbox.count({ where: { id, ...ownMailboxScope(workspace) } })
  if (removable === 0) return NextResponse.json({ error: 'Boîte introuvable' }, { status: 404 })
  const stepUp = await requireStepUp(db, workspace, { deny: { action: 'mailbox.disconnected', target: { type: 'mailbox', id }, req } })
  if (stepUp) return stepUp

  const result = await disconnectMailbox(db, workspaceId, id, req.nextUrl.searchParams.get('force') === '1')
  if (!result.ok) {
    return NextResponse.json({
      error:     'Des campagnes utilisent cette boîte.',
      code:      'MAILBOX_IN_USE',
      campaigns: result.inUse.names,
      total:     result.inUse.total,
    }, { status: 409 })
  }
  await recordAudit(db, workspace, {
    action: 'mailbox.disconnected', target: { type: 'mailbox', id }, req,
    details: { pausedCampaigns: result.pausedCampaigns },
  })
  return NextResponse.json({ ok: true, pausedCampaigns: result.pausedCampaigns })
}

const patchSchema = z.object({
  workspaceId:   z.string().cuid(),
  mailboxId:     z.string().cuid(),
  isDefault:     z.boolean().optional(),
  dailyCap:      z.number().int().min(1).max(MAX_DAILY_CAP).optional(),
  warmupEnabled: z.boolean().optional(),
  /** Admins only: lets every member's campaigns send from it. */
  sharedWithTeam: z.boolean().optional(),
}).refine(
  (b) => b.isDefault !== undefined || b.dailyCap !== undefined || b.warmupEnabled !== undefined || b.sharedWithTeam !== undefined,
  { message: 'Aucun réglage à modifier' },
)

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
  }
  const body = patchSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ error: 'Invalide' }, { status: 422 })

  const { workspaceId, mailboxId, isDefault, dailyCap, warmupEnabled, sharedWithTeam } = body.data
  const workspaceAccess = await requireAccess(userId, 'mailbox.manage', { workspaceId: workspaceId })
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // A mailbox the caller manages (theirs, or any for an admin): every write
  // below is scoped by workspaceId, never by the mailbox id alone.
  const owned = await db.connectedMailbox.findFirst({
    where:  { id: mailboxId, ...ownMailboxScope(workspace) },
    select: { id: true, ownerUserId: true },
  })
  if (!owned) return NextResponse.json({ error: 'Boîte introuvable' }, { status: 404 })
  if (sharedWithTeam !== undefined && !can(workspace.role, 'team.manage')) {
    return NextResponse.json({ error: 'Seul un admin peut partager une boîte avec l’équipe.' }, { status: 403 })
  }

  const settings = {
    ...(dailyCap !== undefined ? { dailyCap } : {}),
    ...(warmupEnabled !== undefined ? { warmupEnabled } : {}),
  }

  await db.$transaction([
    ...(isDefault !== undefined
      ? [
          // One default per member: choosing yours leaves a colleague's alone.
          db.connectedMailbox.updateMany({ where: { workspaceId, ownerUserId: owned.ownerUserId }, data: { isDefault: false } }),
          db.connectedMailbox.updateMany({ where: { id: mailboxId, workspaceId }, data: { isDefault } }),
        ]
      : []),
    ...(Object.keys(settings).length > 0
      ? [db.connectedMailbox.updateMany({ where: { id: mailboxId, workspaceId }, data: settings })]
      : []),
  ])

  let pausedCampaigns = 0
  if (sharedWithTeam !== undefined) {
    const shared = await setMailboxSharing(db, workspaceId, mailboxId, sharedWithTeam)
    if (shared.ok) pausedCampaigns = shared.pausedCampaigns
  }

  return NextResponse.json({ ok: true, pausedCampaigns })
}
