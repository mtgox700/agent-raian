'use client'

import { useEffect, useRef, useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { User, CreditCard, Mail, ShieldCheck, Users } from 'lucide-react'
import { BillingSection } from '@/components/dashboard/billing/BillingSection'
import { ConnectedMailboxes } from '@/components/dashboard/settings/ConnectedMailboxes'
import { ConnectedChannels } from '@/components/dashboard/settings/ConnectedChannels'
import { SignatureSettings } from '@/components/dashboard/settings/SignatureSettings'
import { SmsSettings } from '@/components/dashboard/settings/SmsSettings'
import { TeamSettings } from '@/components/dashboard/settings/TeamSettings'
import { SecuritySettings } from '@/components/dashboard/settings/SecuritySettings'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Plan } from '@prisma/client'

// Only tabs that do something. Personal account security (password, second
// factor) lives in the Clerk account panel opened from Profil; « Sécurité »
// is the workspace's (team 2FA, audit log), for owners and admins.
const TABS = [
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'mailboxes', label: 'E-mails et canaux', icon: Mail },
  { id: 'team', label: 'Équipe', icon: Users },
  { id: 'billing', label: 'Facturation', icon: CreditCard },
  { id: 'security', label: 'Sécurité', icon: ShieldCheck },
] as const

export type SettingsTabId = (typeof TABS)[number]['id']

/** Outcome of an OAuth round trip (mailbox or LinkedIn), read from the URL. */
export interface SettingsNotice {
  kind:    'mailbox' | 'channel'
  ok:      boolean
  reason?: string
}

const MAILBOX_ERRORS: Record<string, string> = {
  access_denied:         "Vous avez refusé l'accès à la boîte mail.",
  unauthorized:          'Session expirée : reconnectez-vous puis réessayez.',
  token_exchange_failed: "Le fournisseur n'a pas validé la connexion. Réessayez.",
  userinfo_failed:       "Impossible de lire l'adresse de la boîte. Réessayez.",
  no_email_on_account:   "Ce compte n'a pas d'adresse e-mail utilisable.",
  mailbox_limit:         "Votre plan a atteint son nombre de boîtes d'envoi. Déconnectez une boîte ou passez au plan supérieur.",
  mailbox_taken:         "Cette adresse est déjà connectée par un autre membre de l'espace. Demandez-lui de la partager, ou à un admin.",
  reverify:              'Confirmez votre identité pour connecter une boîte : relancez la connexion.',
  two_factor_required:   'Votre espace exige la double authentification. Activez-la dans votre profil, puis relancez la connexion.',
}

function noticeMessage(notice: SettingsNotice): string {
  if (notice.kind === 'channel') {
    return notice.ok ? 'Compte LinkedIn connecté.' : "La connexion LinkedIn n'a pas abouti. Réessayez."
  }
  if (notice.ok) return 'Boîte mail connectée : vos campagnes partiront depuis cette adresse.'
  if (notice.reason?.startsWith('invalid_state')) return 'Lien de connexion expiré. Relancez la connexion.'
  return MAILBOX_ERRORS[notice.reason ?? ''] ?? "La connexion de la boîte mail n'a pas abouti. Réessayez."
}

interface BillingProps {
  annualPlans?: readonly ('PRO' | 'BUSINESS' | 'ENTERPRISE')[]
  workspaceId: string
  plan: Plan
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripeCurrentPeriodEnd: Date | null
  campaignsUsed: number
  campaignsLimit: number | null
  leadsUsed: number
  leadsLimit: number | null
}

interface SettingsPageClientProps {
  userName:    string
  userEmail:   string
  workspaceId: string
  workspaceName: string
  billing:     BillingProps
  defaultTab?: SettingsTabId
  notice?:     SettingsNotice
  /** Owners and admins see the workspace's security tab. */
  canSeeSecurity?: boolean
}

function ProfileSection({ userName, userEmail }: { userName: string; userEmail: string }) {
  const { openUserProfile } = useClerk()
  const rows = [
    { label: 'Nom complet', value: userName || '-' },
    { label: 'E-mail', value: userEmail || '-' },
  ]

  return (
    <div className="rounded-[10px] border border-border bg-obsidian">
      <div className="border-b border-border px-5 py-3">
        <h3 className="font-display text-sm font-semibold text-white">Informations personnelles</h3>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <p className="font-mono text-xs text-muted">{row.label}</p>
            <p className="truncate text-sm text-white">{row.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <p className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan" aria-hidden="true" />
          Nom, adresse e-mail, mot de passe, double authentification et appareils connectés.
        </p>
        <Button type="button" size="sm" onClick={() => openUserProfile()}>
          Gérer mon compte
        </Button>
      </div>
    </div>
  )
}

/** The workspace name shown in the sidebar (created as a placeholder at sign-up). */
function WorkspaceNameSection({ initialName }: { initialName: string }) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()
  const dirty = trimmed !== initialName.trim()

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/workspace/name', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: trimmed }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible')
      toast.success('Nom de l’espace de travail enregistré')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[10px] border border-border bg-obsidian">
      <div className="border-b border-border px-5 py-3">
        <h3 className="font-display text-sm font-semibold text-white">Espace de travail</h3>
      </div>
      <form
        className="flex flex-wrap items-center gap-3 px-5 py-4"
        onSubmit={(e) => { e.preventDefault(); if (dirty && trimmed.length >= 2) void save() }}
      >
        <label htmlFor="workspace-name" className="font-mono text-xs text-muted">Nom</label>
        <input
          id="workspace-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-void px-3 text-sm text-white outline-none transition-colors duration-150 ease-signal focus:border-cyan/60 focus-visible:ring-2 focus-visible:ring-cyan/40"
        />
        <Button type="submit" size="sm" disabled={saving || !dirty || trimmed.length < 2}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </div>
  )
}

export function SettingsPageClient({
  userName,
  userEmail,
  workspaceId,
  workspaceName,
  billing,
  defaultTab,
  notice,
  canSeeSecurity = false,
}: SettingsPageClientProps) {
  const tabs = TABS.filter((t) => t.id !== 'security' || canSeeSecurity)
  const [activeTab, setActiveTab] = useState<SettingsTabId>(
    defaultTab && tabs.some((t) => t.id === defaultTab) ? defaultTab : 'profile',
  )

  // Report the OAuth outcome once, then drop it from the URL so a reload
  // does not show it again.
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
    setActiveTab(tabs[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface font-display text-sm font-semibold text-white"
          aria-hidden="true"
        >
          {(userName || userEmail).charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-[-0.02em] text-white">Paramètres</h1>
          <p className="text-xs text-muted">Configurez votre espace de travail Phantera</p>
        </div>
      </div>

      <div className="flex gap-6 max-md:flex-col max-md:gap-3">
        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Sections des paramètres"
          aria-orientation="vertical"
          className="flex w-44 flex-shrink-0 flex-col gap-0.5 max-md:w-full max-md:flex-row max-md:gap-1 max-md:overflow-x-auto max-md:pb-1"
        >
          {tabs.map(({ id, label, icon: Icon }, index) => {
            const selected = activeTab === id
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
                onClick={() => setActiveTab(id)}
                onKeyDown={(e) => onTabKey(e, index)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-xs font-medium transition-colors duration-150 ease-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan max-md:flex-shrink-0 max-md:whitespace-nowrap',
                  selected
                    ? 'border-border bg-surface text-white'
                    : 'border-transparent text-muted hover:bg-surface/60 hover:text-white',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', selected ? 'text-cyan' : 'text-muted')} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>

        <div className="min-w-0 flex-1">
          <div
            key={activeTab}
            id="settings-panel"
            role="tabpanel"
            aria-labelledby={`settings-tab-${activeTab}`}
            tabIndex={0}
            className="space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40 rounded-[10px]"
          >
            {activeTab === 'profile' && (
              <>
                <ProfileSection userName={userName} userEmail={userEmail} />
                <WorkspaceNameSection initialName={workspaceName} />
              </>
            )}

            {activeTab === 'mailboxes' && (
              <>
                <div className="rounded-[10px] border border-border bg-obsidian p-5">
                  <ConnectedMailboxes workspaceId={workspaceId} />
                </div>
                {/* Multichannel: LinkedIn and WhatsApp via Unipile */}
                <div className="rounded-[10px] border border-border bg-obsidian p-5">
                  <ConnectedChannels />
                </div>
                {/* Automatic SMS steps through the workspace's Brevo account */}
                <div className="rounded-[10px] border border-border bg-obsidian p-5">
                  <SmsSettings />
                </div>
                {/* Trust Pack: pro signature appended to sequence emails */}
                <div className="rounded-[10px] border border-border bg-obsidian p-5">
                  <SignatureSettings />
                </div>
              </>
            )}

            {activeTab === 'team' && (
              <div className="rounded-[10px] border border-border bg-obsidian p-5">
                <TeamSettings />
              </div>
            )}

            {activeTab === 'billing' && <BillingSection {...billing} />}

            {activeTab === 'security' && canSeeSecurity && <SecuritySettings />}
          </div>
        </div>
      </div>
    </div>
  )
}
