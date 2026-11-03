'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, ChevronLeft, ChevronRight, Flame, History, Inbox, LayoutDashboard,
  Megaphone, Send, Settings, Sparkles, Users, X, type LucideIcon,
} from 'lucide-react'
import type { EndpointId } from '@phantera/sdk'
import { Logo } from '@/components/brand/Logo'
import { buttonVariants } from '@/components/ui'
import { WorkspaceSwitcher } from '@/components/app/WorkspaceSwitcher'
import { NAV_ITEMS, shell, type NavIcon } from '@/lib/app-copy'
import { api } from '@/lib/front/api'
import { INBOX_READ_EVENT } from '@/lib/inbox/events'
import { cn } from '@/lib/utils'

const ICONS: Record<NavIcon, LucideIcon> = {
  home: LayoutDashboard, campaigns: Megaphone, leads: Users, hot: Flame, inbox: Inbox,
  send: Send, analyst: Sparkles, analytics: BarChart3, history: History, settings: Settings,
}

export interface SidebarProps {
  workspaceName?: string
  plan?: string
  workspaceId?: string
  /** Every workspace of the user: a switcher appears when there is more than one. */
  workspaces?: Array<{ workspaceId: string; name: string }>
  mobileOpen: boolean
  onCloseMobile: () => void
}

type CountEndpoint = Extract<EndpointId, 'inbox.unreadCount' | 'touches.queue'>

/** A sidebar counter, refreshed on navigation and when an item is handled (body n°1's behaviour). */
function useSidebarCount(id: CountEndpoint, pathname: string): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    const load = () => {
      const call = id === 'touches.queue'
        ? api.call('touches.queue', { query: { count: '1' } })
        : api.call('inbox.unreadCount', {})
      call
        .then((data) => { if (!cancelled) setCount('count' in data ? data.count : 0) })
        .catch(() => undefined)
    }
    load()
    window.addEventListener(INBOX_READ_EVENT, load)
    return () => { cancelled = true; window.removeEventListener(INBOX_READ_EVENT, load) }
  }, [id, pathname])
  return count
}

function Count({ value, label }: { value: number; label: string }) {
  if (value <= 0) return null
  return (
    <span className="ml-auto font-mono text-[11px] tabular-nums text-accent" aria-label={label}>
      {value > 99 ? '99+' : value}
    </span>
  )
}

/** Same rule as body n°1: the home and the leads list are active on their exact path only. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && href !== '/dashboard/leads' && pathname.startsWith(href))
}

export function Sidebar({
  workspaceName = shell.defaultWorkspaceName, plan = 'FREE', workspaceId, workspaces = [], mobileOpen, onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname()
  const unreadReplies = useSidebarCount('inbox.unreadCount', pathname)
  const toSend = useSidebarCount('touches.queue', pathname)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-canvas/70 md:hidden" onClick={onCloseMobile} aria-hidden="true" />
      )}

      <aside
        id="app-sidebar"
        className={cn(
          'relative flex h-dvh shrink-0 flex-col border-r border-line bg-raised transition-[width] duration-200 ease-signal',
          collapsed ? 'md:w-16' : 'md:w-60',
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-72',
          'max-md:transition-[transform,visibility] max-md:duration-300 max-md:ease-signal',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:invisible max-md:-translate-x-full',
        )}
      >
        {/* Mark + workspace */}
        <div className={cn('flex h-14 items-center gap-3 border-b border-line', collapsed ? 'md:justify-center md:px-2' : '', 'px-4')}>
          {collapsed ? (
            <Link href="/dashboard" className="max-md:hidden"><Logo surface="app" markOnly /></Link>
          ) : null}
          <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
            {workspaces.length > 1 && workspaceId ? (
              <WorkspaceSwitcher current={workspaceId} workspaces={workspaces} />
            ) : (
              <p className="truncate text-sm font-medium text-ink">{workspaceName}</p>
            )}
            <p className="font-mono text-[11px] text-quiet">{shell.planLabel[plan] ?? plan}</p>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={shell.closeMenu}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:text-ink md:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={shell.navLabel}>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon, badge }) => {
              const active = isActivePath(pathname, href)
              const Icon = ICONS[icon]
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onCloseMobile}
                    aria-current={active ? 'page' : undefined}
                    aria-label={collapsed ? label : undefined}
                    className={cn(
                      'group relative flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-200 ease-signal md:h-9',
                      active ? 'bg-surface text-ink' : 'text-quiet hover:bg-surface/60 hover:text-ink',
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-px bg-accent" aria-hidden="true" />}
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : badge === 'hot' && 'text-signal/80')} aria-hidden="true" />
                    <span className={cn('flex flex-1 items-center justify-between overflow-hidden whitespace-nowrap', collapsed && 'md:hidden')}>
                      {label}
                      {badge === 'inbox' && <Count value={unreadReplies} label={shell.unreadReplies(unreadReplies)} />}
                      {badge === 'phone' && <Count value={toSend} label={shell.toSend(toSend)} />}
                    </span>
                    {collapsed && (
                      <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs text-ink md:group-hover:block md:group-focus-visible:block" aria-hidden="true">
                        {label}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Upgrade, only on the free plan */}
        {plan === 'FREE' && (
          <div className={cn('m-3 rounded-md border border-line p-3', collapsed && 'md:hidden')}>
            <p className="text-sm font-medium text-ink">{shell.upsellTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-quiet">{shell.upsellBody}</p>
            <Link href={shell.upsellHref} className={cn(buttonVariants({ size: 'sm' }), 'mt-3 h-8 w-full text-xs')}>
              {shell.upsellCta}
            </Link>
          </div>
        )}

        <div className={cn('border-t border-line px-4 py-3 max-md:block', collapsed ? 'md:hidden' : '')}>
          <Link href="/dashboard" className="-m-1 inline-block rounded-md p-1"><Logo surface="app" className="h-6" /></Link>
        </div>

        {/* Collapse toggle, desktop only */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? shell.expand : shell.collapse}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          className="absolute -right-3 top-[4.25rem] flex h-6 w-6 items-center justify-center rounded-full border border-line bg-raised text-quiet transition-colors duration-200 ease-signal hover:text-ink max-md:hidden"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </aside>
    </>
  )
}
