/**
 * GET /api/mailbox/diagnostic
 *
 * Returns full diagnostic info about the current user's connected mailboxes
 * and which one would be selected for a given campaign / workspace.
 * Used to debug "email sent from Resend instead of Gmail" issues.
 *
 * Only returns data for workspaces owned by the authenticated user.
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessDenied, requireAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Diagnostics expose configuration: off in production unless switched on
  // for an investigation (ENABLE_DEBUG_ROUTES=1).
  if (process.env.VERCEL_ENV === 'production' && process.env.ENABLE_DEBUG_ROUTES !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const clerkUser  = await currentUser()
  const clerkEmail = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null

  // Configuration details: owners and admins of the active workspace only.
  const access = await requireAccess(userId, 'settings.manage')
  if (!access.ok) return accessDenied(access)

  const user = await db.user.findUnique({
    where:  { clerkId: userId },
    select: { id: true, email: true },
  })
  const workspaces = await db.workspace.findMany({
    where:  { id: access.ctx.workspaceId },
    select: { id: true, name: true, plan: true },
  })

  // For each workspace, fetch its mailboxes
  const workspacesWithMailboxes = await Promise.all(
    workspaces.map(async (ws) => {
      const mailboxes = await db.connectedMailbox.findMany({
        where:  { workspaceId: ws.id },
        select: {
          id: true, provider: true, email: true, status: true,
          isDefault: true, lastSyncAt: true, lastSyncError: true,
          createdAt: true,
        },
      })

      // Latest campaign for this workspace + its mailbox link
      const latestCampaign = await db.campaign.findFirst({
        where:    { workspaceId: ws.id },
        orderBy:  { createdAt: 'desc' },
        select: {
          id: true, name: true, status: true,
          connectedMailboxId: true,
          createdAt: true,
        },
      })

      // Simulate the resolveMailbox() logic
      const resolved = await simulateResolve(ws.id, latestCampaign?.id ?? null)

      return {
        workspaceId:    ws.id,
        workspaceName:  ws.name,
        plan:           ws.plan,
        mailboxes,
        latestCampaign,
        resolvedSender: resolved,
      }
    }),
  )

  return NextResponse.json({
    clerkUserId:   userId,
    clerkEmail,
    internalUser: user ? { id: user.id, email: user.email } : null,
    workspaces:   workspacesWithMailboxes,
    envCheck: {
      hasGoogleClientId:      Boolean(process.env.GOOGLE_CLIENT_ID),
      hasGoogleClientSecret:  Boolean(process.env.GOOGLE_CLIENT_SECRET),
      hasGoogleRedirectUri:   process.env.GOOGLE_REDIRECT_URI ?? null,
      hasMicrosoftClientId:   Boolean(process.env.MICROSOFT_CLIENT_ID),
      hasEncryptionKey:       Boolean(process.env.ENCRYPTION_KEY),
      hasResendApiKey:        Boolean(process.env.RESEND_API_KEY),
      baseUrl:                process.env.NEXT_PUBLIC_BASE_URL ?? null,
    },
  })
}

/**
 * Replicates the resolveMailbox() logic from sender-router.ts so the user
 * can see exactly what would happen if a campaign were sent right now.
 */
async function simulateResolve(workspaceId: string, campaignId: string | null) {
  // 1. Campaign-specific
  if (campaignId) {
    const campaign = await db.campaign.findUnique({
      where:   { id: campaignId },
      include: {
        connectedMailbox: {
          select: { id: true, provider: true, email: true, status: true },
        },
      },
    })
    if (campaign?.connectedMailbox && campaign.connectedMailbox.status === 'CONNECTED') {
      return {
        source: 'campaign.connectedMailbox',
        provider: campaign.connectedMailbox.provider,
        email:    campaign.connectedMailbox.email,
      }
    }
  }

  // 2. Default
  const defaultMailbox = await db.connectedMailbox.findFirst({
    where:  { workspaceId, isDefault: true, status: 'CONNECTED' },
    select: { id: true, provider: true, email: true },
  })
  if (defaultMailbox) {
    return {
      source: 'workspace.default',
      provider: defaultMailbox.provider,
      email:    defaultMailbox.email,
    }
  }

  // 3. Any connected
  const any = await db.connectedMailbox.findFirst({
    where:  { workspaceId, status: 'CONNECTED' },
    select: { id: true, provider: true, email: true },
  })
  if (any) {
    return {
      source: 'workspace.any_connected',
      provider: any.provider,
      email:    any.email,
    }
  }

  return { source: 'FALLBACK_RESEND', provider: 'RESEND', email: process.env.RESEND_FROM_EMAIL ?? 'outreach@phantera-tn.com' }
}
