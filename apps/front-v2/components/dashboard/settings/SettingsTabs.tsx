'use client'

/**
 * The settings screen: a vertical tab list (a row of tabs on a phone) and the
 * open section. Only tabs that do something; personal account security
 * (password, second factor) lives in the Clerk account panel opened from
 * Profil, « Sécurité » is the workspace's, for owners and admins.
 */
import { useEffect, useRef, useState } from 'react'
import { CreditCard, Mail, ShieldCheck, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Panel } from '@/components/ui'
import { noticeCopy, settingsPage as t } from '@/lib/copy/settings'
import type { SettingsNotice, SettingsTabId, SettingsView } from '@/lib/front/types-settings'
import { cn } from '@/lib/utils'
import { BillingSection } from './BillingSection'
import { ConnectedChannels } from './ConnectedChannels'
import { ConnectedMailboxes } from './ConnectedMailboxes'
import { ProfileSection, WorkspaceNameSection } from './ProfileSettings'
import { SecuritySettings } from './SecuritySettings'
import { SignatureSettings } from './SignatureSettings'
import { SmsSettings } from './SmsSettings'
import { TeamSettings } from './TeamSettings'

const TABS = [
  { id: 'profile', icon: User },
  { id: 'mailboxes', icon: Mail },
  { id: 'team', icon: Users },
  { id: 'billing', icon: CreditCard },
  { id: 'security', icon: ShieldCheck },
] as const satisfies readonly { id: SettingsTabId; icon: unknown }[]

function noticeMessage(notice: SettingsNotice): string {
  if (notice.kind === 'channel') return notice.ok ? noticeCopy.channelOk : noticeCopy.channelFailed
  if (notice.ok) return noticeCopy.mailboxOk
  if (notice.reason?.startsWith('invalid_state')) return noticeCopy.invalidState
  return noticeCopy.errors[notice.reason ?? ''] ?? noticeCopy.mailboxFailed
}

export function SettingsTabs({ view, defaultTab, notice }: {
  view: SettingsView
  defaultTab?: SettingsTabId
  notice?: SettingsNotice
}) {
  const tabs = TABS.filter((tab) => tab.id !== 'security' || view.canSeeSecurity)
  const [active, setActive] = useState<SettingsTabId>(
    defaultTab && tabs.some((tab) => tab.id === defaultTab) ? defaultTab : 'profile',
  )

  // Report the OAuth outcome once, then drop it from the URL so a reload does not show it again.
  const noticeShown = useRef(false)
  useEffect(() => {
    if (!notice || noticeShown.current) return
    noticeShown.current = true
    const message = noticeMessage(notice)
    if (notice.ok) toast.success(message)
    else toast.error(message)
    window.history.replaceState(null, '', `/dashboard/settings?tab=${defaultTab ?? 'mailboxes'}`)
  }, [notice, defaultTab])

  // Tabs pattern (WAI-ARIA): arrows move between tabs, Home and End jump.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    setActive(tabs[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="flex gap-6 max-md:flex-col max-md:gap-4">
      <div
        role="tablist"
        aria-label={t.tablist}
        aria-orientation="vertical"
        className="flex w-48 shrink-0 flex-col gap-px max-md:-mx-4 max-md:w-auto max-md:flex-row max-md:overflow-x-auto max-md:border-b max-md:border-line max-md:px-4"
      >
        {tabs.map(({ id, icon: Icon }, index) => {
          const selected = active === id
          return (
            <button
              key={id}
              ref={(el) => { tabRefs.current[index] = el }}
              id={`settings-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="settings-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(id)}
              onKeyDown={(e) => onTabKey(e, index)}
              className={cn(
                'relative flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-200 ease-signal max-md:shrink-0 max-md:rounded-none max-md:py-3',
                selected ? 'bg-surface text-ink max-md:bg-transparent' : 'text-quiet hover:bg-surface/60 hover:text-ink max-md:hover:bg-transparent',
              )}
            >
              {/* The point of the sequence marks where you are. */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute bg-accent transition-opacity duration-200 ease-signal md:left-0 md:top-1/2 md:h-4 md:w-0.5 md:-translate-y-1/2 max-md:inset-x-3 max-md:bottom-0 max-md:h-0.5',
                  selected ? 'opacity-100' : 'opacity-0',
                )}
              />
              <Icon className={cn('h-4 w-4', selected ? 'text-accent' : 'text-quiet')} aria-hidden="true" />
              {t.tabs[id]}
            </button>
          )
        })}
      </div>

      <div
        key={active}
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${active}`}
        tabIndex={0}
        className="min-w-0 flex-1 space-y-4 rounded-lg"
      >
        {active === 'profile' && (
          <>
            <ProfileSection userName={view.userName} userEmail={view.userEmail} />
            <WorkspaceNameSection initialName={view.workspaceName} />
          </>
        )}

        {active === 'mailboxes' && (
          <>
            <Panel><ConnectedMailboxes workspaceId={view.workspaceId} /></Panel>
            {/* Multichannel: LinkedIn via Unipile */}
            <Panel><ConnectedChannels /></Panel>
            {/* Automatic SMS steps through the workspace's Brevo account */}
            <Panel><SmsSettings /></Panel>
            {/* Trust Pack: pro signature appended to sequence emails */}
            <Panel><SignatureSettings /></Panel>
          </>
        )}

        {active === 'team' && <Panel><TeamSettings /></Panel>}

        {active === 'billing' && <BillingSection {...view.billing} />}

        {active === 'security' && view.canSeeSecurity && <SecuritySettings />}
      </div>
    </div>
  )
}
