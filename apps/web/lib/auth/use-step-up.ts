'use client'

/**
 * Client side of lib/auth/step-up. `stepUpFetch` behaves like fetch; when
 * the server answers that the session must verify again, Clerk's
 * verification dialog opens and the request is replayed once verified.
 * `confirmStepUp` does the same before a navigation that cannot carry the
 * dialog itself (the OAuth consent of a mailbox).
 */

import { useCallback } from 'react'
import { useReverification } from '@clerk/nextjs'

const CANCELLED = 'Vérification annulée : l’action n’a pas été effectuée.'

export function isReverificationRequest(body: unknown): boolean {
  const error = (body as { clerk_error?: { reason?: string } } | null)?.clerk_error
  return error?.reason === 'reverification-error'
}

function refusal(error: string, status = 403): Response {
  return Response.json({ error }, { status })
}

export function useStepUp() {
  // Clerk reads the JSON returned here to decide whether to open its dialog.
  const verify = useReverification(async () => (await fetch('/api/security/step-up', { method: 'POST' })).json() as Promise<unknown>)

  const stepUpFetch = useCallback(async (input: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(input, init)
    if (res.status !== 403) return res
    const body: unknown = await res.clone().json().catch(() => null)
    if (!isReverificationRequest(body)) return res
    try {
      const verified = await verify()
      if (isReverificationRequest(verified)) return refusal(CANCELLED)
    } catch {
      return refusal(CANCELLED)
    }
    return fetch(input, init)
  }, [verify])

  /** Null when the session is verified, or the message to show. */
  const confirmStepUp = useCallback(async (): Promise<string | null> => {
    const res = await stepUpFetch('/api/security/step-up', { method: 'POST' })
    if (res.ok) return null
    const body = await res.json().catch(() => null) as { error?: string } | null
    return body?.error ?? CANCELLED
  }, [stepUpFetch])

  return { stepUpFetch, confirmStepUp }
}
