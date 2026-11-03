'use client'

/**
 * "Trouver son numéro" : asks Apollo for the lead's professional phone.
 * Apollo answers in a few minutes; the panel checks back while it is open.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'

type RevealStatus = 'PENDING' | 'FOUND' | 'NOT_FOUND' | 'REJECTED' | null

interface RevealState {
  status: RevealStatus
  phone: string | null
  fromApollo: boolean
  remainingMonth: number
}

const POLL_MS = 15_000
const MAX_POLLS = 24

export function PhoneRevealButton({ leadId, onPhoneFound }: { leadId: string; onPhoneFound: (phone: string) => void }) {
  const [state, setState] = useState<RevealState | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const polls = useRef(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/phone/reveal`)
      if (!res.ok) return
      const data = await res.json() as RevealState
      setState(data)
      if (data.phone) onPhoneFound(data.phone)
    } catch { /* the lookup is optional */ }
  }, [leadId, onPhoneFound])

  useEffect(() => { polls.current = 0; void load() }, [load])

  useEffect(() => {
    if (state?.status !== 'PENDING' || state.phone) return
    const timer = setInterval(() => {
      polls.current += 1
      if (polls.current > MAX_POLLS) { clearInterval(timer); return }
      void load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [state?.status, state?.phone, load])

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/phone/reveal`, { method: 'POST' })
      const data = await res.json() as { error?: string; remainingMonth?: number }
      if (!res.ok) throw new Error(data.error ?? 'Recherche impossible')
      polls.current = 0
      setState((s) => s && { ...s, status: 'PENDING', remainingMonth: data.remainingMonth ?? s.remainingMonth })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recherche impossible')
    } finally {
      setStarting(false)
    }
  }

  if (!state || !state.fromApollo || state.phone) return null

  if (state.status === 'PENDING') {
    return (
      <p className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Recherche du numéro en cours : la réponse arrive en quelques minutes.
      </p>
    )
  }
  // FOUND without a number: the user typed or cleared it since; nothing to offer.
  if (state.status === 'FOUND') return null
  if (state.status === 'NOT_FOUND') {
    return <p className="mt-2 text-[11px] text-muted">Aucun numéro joignable trouvé pour ce lead.</p>
  }
  if (state.remainingMonth === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={starting}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-semibold text-muted transition-colors duration-150 hover:border-cyan/30 hover:text-white disabled:opacity-50"
      >
        {starting ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
        Trouver son numéro
        <span className="font-mono font-normal tabular-nums text-muted">· {state.remainingMonth} restante{state.remainingMonth > 1 ? 's' : ''} ce mois</span>
      </button>
      {error && <p className="mt-1 text-[11px] text-danger" role="alert">{error}</p>}
    </div>
  )
}
