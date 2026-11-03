'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BrandEmblem } from '@/components/brand/BrandLogo'
import { WorkspaceSwitcher } from '@/components/dashboard/WorkspaceSwitcher'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Flame,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Inbox,
  History,
  Send,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobileNav } from '@/lib/stores/mobile-nav'
import { INBOX_READ_EVENT } from '@/lib/inbox/events'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

const NAV_ITEMS = [
  { href: '/dashboard',            label: 'Accueil',       icon: LayoutDashboard, badge: null },
  { href: '/dashboard/campaigns',  label: 'Campagnes',     icon: Megaphone,       badge: null },
  { href: '/dashboard/leads',      label: 'Leads',         icon: Users,           badge: null },
  { href: '/dashboard/leads/hot',  label: 'Leads chauds',  icon: Flame,           badge: 'hot' },
  { href: '/dashboard/inbox',      label: 'Réponses',      icon: Inbox,           badge: 'inbox' },
  { href: '/dashboard/a-envoyer',  label: 'À envoyer',     icon: Send,            badge: 'phone' },
  { href: '/dashboard/analyst',    label: 'Analyste',      icon: Sparkles,        badge: null },
  { href: '/dashboard/analytics',  label: 'Analyses',      icon: BarChart3,       badge: null },
  { href: '/dashboard/history',    label: 'Historique',    icon: History,         badge: null },
  { href: '/dashboard/settings',   label: 'Paramètres',    icon: Settings,        badge: null },
] as const

const PLAN_LABEL: Record<string, string> = { FREE: 'Formule gratuite', STARTER: 'Formule Starter', PRO: 'Formule Pro', BUSINESS: 'Formule Business', ENTERPRISE: 'Formule Entreprise' }

// The upsell says what Pro really adds (lib/stripe/plans.ts), nothing more:
// it used to promise "unlimited leads", Pro is 1 000 a month.
const pro = PLAN_CONFIG.PRO
const UPSELL = `${pro.leadsLimit.toLocaleString('fr-FR')} leads par mois, campagnes illimitées et rédaction par l’IA avec auto-critique.`

interface SidebarProps {
  workspaceName?: string
  plan?: string
  workspaceId?: string
  /** Every workspace of the user: a switcher appears when there is more than one. */
  workspaces?: Array<{ workspaceId: string; name: string }>
}

/** A sidebar counter, refreshed on navigation and when an item is handled. */
function useSidebarCount(url: string, pathname: string): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(url)
        .then((res) => (res.ok ? res.json() as Promise<{ count?: number }> : { count: 0 }))
        .then((data) => { if (!cancelled) setCount(data.count ?? 0) })
        .catch(() => undefined)
    }
    load()
    window.addEventListener(INBOX_READ_EVENT, load)
    return () => { cancelled = true; window.removeEventListener(INBOX_READ_EVENT, load) }
  }, [url, pathname])
  return count
}

function Count({ value, label }: { value: number; label: string }) {
  if (value <= 0) return null
  return (
    <span className="ml-auto font-mono text-[11px] tabular-nums text-cyan" aria-label={label}>
      {value > 99 ? '99+' : value}
    </span>
  )
}

export function Sidebar({ workspaceName = 'Mon espace', plan = 'FREE', workspaceId, workspaces = [] }: SidebarProps) {
  const pathname = usePathname()
  const unreadReplies = useSidebarCount('/api/inbox/unread-count', pathname)
  const phoneQueue    = useSidebarCount('/api/touches/queue?count=1', pathname)
  const [collapsed, setCollapsed] = useState(false)

  // Mobile drawer state (only used at < md breakpoint)
  const mobileOpen  = useMobileNav((s) => s.open)
  const closeMobile = useMobileNav((s) => s.close)

  // Auto-close drawer on route change (mobile UX)
  useEffect(() => { closeMobile() }, [pathname, closeMobile])

  // Lock body scroll while mobile drawer is open
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.innerWidth >= 768) return
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      {/* Mobile backdrop (md and below only) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={closeMobile} aria-hidden="true" />
      )}

      <aside
        className={cn(
          'relative flex h-[100dvh] flex-shrink-0 flex-col border-r border-border bg-obsidian transition-[width] duration-200 ease-signal',
          collapsed ? 'md:w-16' : 'md:w-60',
          // Mobile: fixed drawer, slides in from the left
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-72',
          'max-md:transition-transform max-md:duration-300 max-md:ease-signal',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
      >
        {/* Mark + workspace */}
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <BrandEmblem size={28} />

          {!collapsed && (
            <div className="min-w-0">
              {workspaces.length > 1 && workspaceId ? (
                <WorkspaceSwitcher current={workspaceId} workspaces={workspaces} />
              ) : (
                <p className="truncate text-sm font-medium text-white">{workspaceName}</p>
              )}
              <p className="font-mono text-[11px] text-muted">{PLAN_LABEL[plan] ?? plan}</p>
            </div>
          )}

          <button
            onClick={closeMobile}
            aria-label="Fermer le menu"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:text-white md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navigation de l’espace">
          {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
            const isActive = pathname === href || (href !== '/dashboard' && href !== '/dashboard/leads' && pathname.startsWith(href))

            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 md:h-9',
                  isActive ? 'bg-surface text-white' : 'text-muted hover:bg-surface/60 hover:text-white',
                )}
              >
                {isActive && <span className="absolute inset-y-2 left-0 w-px bg-cyan" aria-hidden="true" />}

                <Icon
                  className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isActive ? 'text-cyan' : badge === 'hot' ? 'text-gold/80' : '',
                  )}
                  aria-hidden="true"
                />

                {!collapsed && (
                  <span className="flex flex-1 items-center justify-between overflow-hidden whitespace-nowrap">
                    {label}
                    {badge === 'inbox' && (
                      <Count value={unreadReplies} label={`${unreadReplies} réponse${unreadReplies > 1 ? 's' : ''} non lue${unreadReplies > 1 ? 's' : ''}`} />
                    )}
                    {badge === 'phone' && (
                      <Count value={phoneQueue} label={`${phoneQueue} message${phoneQueue > 1 ? 's' : ''} à envoyer`} />
                    )}
                  </span>
                )}

                {/* Tooltip when collapsed (desktop only) */}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-border bg-obsidian px-2.5 py-1.5 text-xs text-white group-hover:block group-focus-visible:block">
                    {label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Upgrade, only on the free plan */}
        {!collapsed && plan === 'FREE' && (
          <div className="m-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-white">{`Passer à ${pro.name}`}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{UPSELL}</p>
            <Link
              href="/dashboard/settings?tab=billing"
              className="mt-3 flex h-8 items-center justify-center rounded-md bg-cyan text-xs font-semibold text-void transition-colors hover:bg-cyan-300"
            >
              Voir les formules
            </Link>
          </div>
        )}

        {/* Collapse toggle, desktop only */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-[4.25rem] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-obsidian text-muted transition-colors hover:text-white max-md:hidden"
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>
    </>
  )
}
