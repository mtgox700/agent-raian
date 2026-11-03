'use client'

/**
 * "Trouver son numéro": asks Apollo for the lead's professional phone.
 * Apollo answers in a few minutes; the panel checks back while it is open.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { api } from '@/lib/front/api'
import { phoneCopy } from '@/lib/copy/leads'
import { apiErrorMessage } from './errors'
import type { PhoneRevealState } from '@/lib/front/types-leads'

const POLL_MS = 15_000
const MAX_POLLS = 24
const t = phoneCopy.reveal

export function PhoneRevealButton({ leadId, onPhoneFound }: { leadId: string; onPhoneFound: (phone: string) => void }) {
  const [state, setState] = useState<PhoneRevealState | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const polls = useRef(0)

  const load = useCallback(async () => {
    try {
      const data = await api.call('leads.phoneRevealState', { params: { leadId } })
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
      const data = await api.call('leads.phoneReveal', { params: { leadId } })
      polls.current = 0
      setState((s) => s && { ...s, status: 'PENDING', remainingMonth: data.remainingMonth ?? s.remainingMonth })
    } catch (err) {
      setError(apiErrorMessage(err, t.failed))
    } finally {
      setStarting(false)
    }
  }

  if (!state || !state.fromApollo || state.phone) return null

  if (state.status === 'PENDING') {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-quiet" role="status">
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> {t.pending}
      </p>
    )
  }
  // FOUND without a number: the user typed or cleared it since; nothing to offer.
  if (state.status === 'FOUND') return null
  if (state.status === 'NOT_FOUND') return <p className="mt-2 text-xs text-quiet">{t.notFound}</p>
  if (state.remainingMonth === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={starting}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-quiet transition-colors duration-200 ease-signal hover:border-accent hover:text-ink disabled:opacity-50"
      >
        {starting ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
        {t.find}
        <span className="font-mono font-normal tabular-nums text-quiet">{t.remaining(state.remainingMonth)}</span>
      </button>
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  )
}
