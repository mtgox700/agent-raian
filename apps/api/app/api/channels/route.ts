/**
 * GET /api/channels: list the workspace's connected multichannel accounts.
 *
 * Self-healing: before listing, PENDING rows are RECONCILED directly against
 * Unipile's account list. This recovers every case where the hosted-auth
 * notify webhook never reached us (typical: flow tested from localhost, which
 * Unipile cannot call back). An unlinked Unipile account is claimed only when
 * the match is unambiguous (see lib/multichannel/reconcile); abandoned pending
 * rows are pruned.
 */
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { visibleChannelScope } from '@/lib/auth/scope'
import { isUnipileConfigured, listUnipileAccounts } from '@/lib/multichannel/unipile'
import { CLAIM_WINDOW_MS, pickClaimableAccount } from '@/lib/multichannel/reconcile'

export const runtime = 'nodejs'

async function reconcilePending(workspaceId: string): Promise<void> {
  const pending = await db.connectedChannel.findMany({
    where:   { workspaceId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  })
  if (pending.length === 0 || !isUnipileConfigured()) return

  let accounts
  try {
    accounts = await listUnipileAccounts()
  } catch {
    return // Unipile unreachable: keep rows as-is, never break the listing
  }

  // Accounts already linked (any workspace) are not claimable.
  const linked = await db.connectedChannel.findMany({
    where:  { unipileAccountId: { not: null } },
    select: { unipileAccountId: true },
  })
  const linkedIds = new Set(linked.map((l) => l.unipileAccountId))
  const unlinked = accounts.filter((a) => !linkedIds.has(a.id))

  for (const row of pending) {
    // Attempts in progress elsewhere on the platform make the match ambiguous.
    const otherPending = await db.connectedChannel.count({
      where: {
        id:        { not: row.id },
        provider:  row.provider,
        status:    'PENDING',
        createdAt: { gte: new Date(row.createdAt.getTime() - CLAIM_WINDOW_MS) },
      },
    })
    const match = pickClaimableAccount(row, unlinked, otherPending)
    if (match) {
      unlinked.splice(unlinked.indexOf(match), 1)
      await db.connectedChannel.update({
        where: { id: row.id },
        data:  {
          unipileAccountId: match.id,
          label:            match.name,
          status:           'CONNECTED',
          lastError:        null,
        },
      }).catch(() => null) // unique race on accountId: another row won, fine
    } else if (Date.now() - row.createdAt.getTime() > 2 * 60 * 60 * 1000) {
      // No safe match after 2h: the attempt was abandoned. Prune.
      await db.connectedChannel.delete({ where: { id: row.id } }).catch(() => null)
    }
  }
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'workspace.read')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  await reconcilePending(workspace.workspaceId)

  const rows = await db.connectedChannel.findMany({
    where:   visibleChannelScope(workspace),
    select:  { id: true, provider: true, status: true, label: true, lastError: true, createdAt: true, ownerUserId: true, sharedWithTeam: true },
    orderBy: { createdAt: 'desc' },
  })
  const channels = rows.map(({ ownerUserId, ...channel }) => ({ ...channel, mine: ownerUserId === workspace.userId }))

  return NextResponse.json({ channels })
}
