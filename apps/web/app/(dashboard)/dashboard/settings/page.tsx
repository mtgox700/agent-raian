import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { SettingsPageClient, type SettingsNotice } from '@/components/dashboard/SettingsPageClient'
import { loadView } from '@/lib/front/server-api'

interface Props {
  searchParams: Promise<{ tab?: string; billing?: string; mailbox?: string; reason?: string; channel?: string }>
}

/** /dashboard/settings (data: GET /api/views/settings). */
export default async function SettingsPage({ searchParams }: Props) {
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

  const view = await loadView('views.settings', {})
  const { stripeCurrentPeriodEnd } = view.billing

  return (
    <DashboardShell>
      <SettingsPageClient
        userName={view.userName}
        userEmail={view.userEmail}
        workspaceId={view.workspaceId}
        workspaceName={view.workspaceName}
        defaultTab={defaultTab}
        notice={notice}
        canSeeSecurity={view.canSeeSecurity}
        billing={{
          ...view.billing,
          stripeCurrentPeriodEnd: stripeCurrentPeriodEnd ? new Date(stripeCurrentPeriodEnd) : null,
        }}
      />
    </DashboardShell>
  )
}
