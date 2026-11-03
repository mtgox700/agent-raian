'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Input, Panel } from '@/components/ui'
import { profileCopy as t } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import { errorMessage } from './ui'

/** Personal account: shown here, edited in Clerk's account panel. */
export function ProfileSection({ userName, userEmail }: { userName: string; userEmail: string }) {
  const { openUserProfile } = useClerk()
  const rows = [
    { label: t.fullName, value: userName || '-' },
    { label: t.email, value: userEmail || '-' },
  ]

  return (
    <Panel title={t.title} padded={false}>
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3.5 md:px-5">
            <dt className="font-mono text-xs text-quiet">{row.label}</dt>
            <dd className="truncate text-sm text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4 md:px-5">
        <p className="flex items-center gap-2 text-xs text-quiet">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          {t.accountHint}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => openUserProfile()}>{t.manage}</Button>
      </div>
    </Panel>
  )
}

/** The workspace name shown in the sidebar (created as a placeholder at sign-up). */
export function WorkspaceNameSection({ initialName }: { initialName: string }) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()
  const dirty = trimmed !== initialName.trim()

  const save = async () => {
    setSaving(true)
    try {
      await api.call('workspace.rename', { body: { name: trimmed } })
      toast.success(t.saved)
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err, t.failed))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title={t.workspaceTitle}>
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => { e.preventDefault(); if (dirty && trimmed.length >= 2) void save() }}
      >
        <label htmlFor="workspace-name" className="font-mono text-xs text-quiet">{t.workspaceName}</label>
        <Input
          id="workspace-name"
          size="sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="min-w-0 flex-1 basis-56"
        />
        <Button type="submit" size="sm" disabled={saving || !dirty || trimmed.length < 2}>
          {saving ? t.saving : t.save}
        </Button>
      </form>
    </Panel>
  )
}
