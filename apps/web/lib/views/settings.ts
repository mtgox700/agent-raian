/**
 * Data of the Settings page (/dashboard/settings), served by GET /api/views/settings.
 *
 * Workspace billing data of the member's active workspace, usage counted
 * like the quota checks (lib/stripe/quota.ts). Stripe identifiers are the
 * owner's business: other roles see the plan only.
 */

import type { Plan, PrismaClient } from '@prisma/client'
import { currentUser } from '@clerk/nextjs/server'
import type { AccessContext } from '@/lib/auth/access'
import { getPlanLimits, PLAN_CONFIG } from '@/lib/stripe/plans'
import { can } from '@/lib/auth/permissions'

export interface SettingsBilling {
  annualPlans: ('PRO' | 'BUSINESS' | 'ENTERPRISE')[]
  workspaceId: string
  plan: Plan
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  /** ISO date. */
  stripeCurrentPeriodEnd: string | null
  campaignsUsed: number
  campaignsLimit: number | null
  leadsUsed: number
  leadsLimit: number | null
}

export interface SettingsView {
  userName: string
  userEmail: string
  workspaceId: string
  workspaceName: string
  canSeeSecurity: boolean
  billing: SettingsBilling
}

export async function settingsView(db: PrismaClient, access: AccessContext | null): Promise<SettingsView> {
  const clerkUser = await currentUser()
  const userName = `${clerkUser?.firstName ?? ''} ${clerkUser?.lastName ?? ''}`.trim()
  const userEmail = clerkUser?.emailAddresses?.[0]?.emailAddress ?? ''

  // Workspace billing data: the active workspace of this member.
  const raw = access
    ? await db.workspace.findUnique({
        where:  { id: access.workspaceId },
        select: {
          id: true,
          name: true,
          plan: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripeCurrentPeriodEnd: true,
        },
      })
    : null
  // Stripe identifiers are the owner's business: other roles see the plan only.
  const workspace = raw && access && can(access.role, 'billing.manage')
    ? raw
    : raw && { ...raw, stripeCustomerId: null, stripeSubscriptionId: null, stripeCurrentPeriodEnd: null }

  // Same counts as the quota checks (lib/stripe/quota.ts): leads created this
  // calendar month, campaigns that are not finished.
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const [campaignsUsed, leadsUsed] = workspace
    ? await Promise.all([
        db.campaign.count({
          where: { workspaceId: workspace.id, status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } },
        }),
        db.lead.count({ where: { workspaceId: workspace.id, createdAt: { gte: startOfMonth } } }),
      ])
    : [0, 0]

  const plan = workspace?.plan ?? 'FREE'
  const limits = getPlanLimits(plan)

  return {
    userName,
    userEmail,
    workspaceId: workspace?.id ?? '',
    workspaceName: workspace?.name ?? '',
    canSeeSecurity: Boolean(access && can(access.role, 'audit.read')),
    billing: {
      workspaceId: workspace?.id ?? '',
      plan,
      stripeCustomerId: workspace?.stripeCustomerId ?? null,
      stripeSubscriptionId: workspace?.stripeSubscriptionId ?? null,
      stripeCurrentPeriodEnd: workspace?.stripeCurrentPeriodEnd?.toISOString() ?? null,
      campaignsUsed,
      campaignsLimit: limits.campaignsLimit === Infinity ? null : limits.campaignsLimit,
      leadsUsed,
      leadsLimit: limits.leadsLimit === Infinity ? null : limits.leadsLimit,
      // Offers with an annual price in Stripe: the price IDs only exist on the server.
      annualPlans: (['PRO', 'BUSINESS', 'ENTERPRISE'] as const).filter((k) => Boolean(PLAN_CONFIG[k].stripeAnnualPriceId)),
    },
  }
}
