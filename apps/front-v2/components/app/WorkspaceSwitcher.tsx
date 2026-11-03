'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { shell } from '@/lib/app-copy'
import { api } from '@/lib/front/api'

/**
 * Switches the active workspace (signed cookie, set by the server after it
 * checked the user belongs to the chosen one), then reloads the dashboard.
 */
export function WorkspaceSwitcher({ current, workspaces }: {
  current: string
  workspaces: Array<{ workspaceId: string; name: string }>
}) {
  const [pending, setPending] = useState(false)

  async function choose(workspaceId: string) {
    if (workspaceId === current) return
    setPending(true)
    try {
      await api.call('workspace.setActive', { body: { workspaceId } })
    } catch {
      setPending(false)
      toast.error(shell.switchFailed)
      return
    }
    window.location.assign('/dashboard')
  }

  return (
    <select
      aria-label={shell.switchWorkspace}
      value={current}
      disabled={pending}
      onChange={(e) => void choose(e.target.value)}
      className="max-w-full truncate rounded-sm border-none bg-transparent p-0 text-sm font-semibold text-ink disabled:opacity-50 [&_option]:bg-raised"
    >
      {workspaces.map((w) => (
        <option key={w.workspaceId} value={w.workspaceId}>{w.name}</option>
      ))}
    </select>
  )
}
