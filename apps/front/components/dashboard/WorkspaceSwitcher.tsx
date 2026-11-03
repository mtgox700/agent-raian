'use client'

import { useState } from 'react'
import { toast } from 'sonner'

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
    const res = await fetch('/api/workspace/active', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ workspaceId }),
    })
    if (!res.ok) {
      setPending(false)
      toast.error('Impossible d’ouvrir cet espace.')
      return
    }
    window.location.assign('/dashboard')
  }

  return (
    <select
      aria-label="Changer d’espace de travail"
      value={current}
      disabled={pending}
      onChange={(e) => void choose(e.target.value)}
      className="max-w-[150px] truncate rounded-md border-none bg-transparent p-0 text-sm font-semibold text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan/60 disabled:opacity-50"
    >
      {workspaces.map((w) => (
        <option key={w.workspaceId} value={w.workspaceId} className="bg-obsidian text-white">{w.name}</option>
      ))}
    </select>
  )
}
