import type { Metadata } from 'next'
import { AppPage } from '@/components/app/AppPage'
import { SettingsTabs } from '@/components/dashboard/settings/SettingsTabs'
import { settingsPage } from '@/lib/copy/settings'
import { loadView } from '@/lib/front/server-api'
import type { SettingsNotice } from '@/lib/front/types-settings'

export const metadata: Metadata = { title: settingsPage.title }

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

  // views.settings has no redirect of its own: a missing session is sent to sign-in by loadView.
  const view = await loadView('views.settings', {})

  return (
    <AppPage title={settingsPage.title} description={settingsPage.description}>
      <SettingsTabs view={view} defaultTab={defaultTab} notice={notice} />
    </AppPage>
  )
}
