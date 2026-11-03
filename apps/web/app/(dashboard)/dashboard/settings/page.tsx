import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { SettingsPageClient, type SettingsNotice } from '@/components/dashboard/SettingsPageClient'
import { db } from '@/lib/db'
import { getPlanLimits, PLAN_CONFIG } from '@/lib/stripe/plans'
import { loadAccess } from '@/lib/auth/access'
import { can } from '@/lib/auth/permissions'

interface Props {
  searchParams: Promise<{ tab?: string; billing?: string; mailbox?: string; reason?: string; channel?: string }>
}

export default async function SettingsPage({ searchParams }: Props) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const params = await searchParams
  // ?tab=<id> opens a tab directly (links from the campaign page, billing
  // redirects); the legacy /settings/billing redirect sets ?billing.
  // Gmail/Outlook and LinkedIn OAuth callbacks come back with ?mailbox= or
  // ?channel=: open the tab they belong to and report the outcome.
  const linkable = ['billing', 'mailboxes', 'team', 'security'] as const
  const requested = linkable.find((tab) => tab === params.tab)
  const fromOAuth = params.mailbox || params.channel ? 'mailboxes' : undefined
  const defaultTab = requested ?? fromOAuth ?? (params.billing ? 'billing' : undefined)
  const notice: SettingsNotice | undefined = params.mailbox
    ? { kind: 'mailbox', ok: params.mailbox === 'connected', reason: params.reason?.slice(0, 80) }
    : params.channel
      ? { kind: 'channel', ok: params.channel === 'connected' }
      : undefined

  const clerkUser = await currentUser()
  const userName = `${clerkUser?.firstName ?? ''} ${clerkUser?.lastName ?? ''}`.trim()
  const userEmail = clerkUser?.emailAddresses?.[0]?.emailAddress ?? ''

  // Workspace billing data: the active workspace of this member.
  const access = await loadAccess(userId)
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

  return (
    <DashboardShell>
      <SettingsPageClient
        userName={userName}
        userEmail={userEmail}
        workspaceId={workspace?.id ?? ''}
        workspaceName={workspace?.name ?? ''}
        defaultTab={defaultTab}
        notice={notice}
        canSeeSecurity={Boolean(access && can(access.role, 'audit.read'))}
        billing={{
          workspaceId: workspace?.id ?? '',
          plan,
          stripeCustomerId: workspace?.stripeCustomerId ?? null,
          stripeSubscriptionId: workspace?.stripeSubscriptionId ?? null,
          stripeCurrentPeriodEnd: workspace?.stripeCurrentPeriodEnd ?? null,
          campaignsUsed,
          campaignsLimit: limits.campaignsLimit === Infinity ? null : limits.campaignsLimit,
          leadsUsed,
          leadsLimit: limits.leadsLimit === Infinity ? null : limits.leadsLimit,
          // Offers with an annual price in Stripe: the price IDs only exist on the server.
          annualPlans: (['PRO', 'BUSINESS', 'ENTERPRISE'] as const).filter((k) => Boolean(PLAN_CONFIG[k].stripeAnnualPriceId)),
        }}
      />
    </DashboardShell>
  )
}
