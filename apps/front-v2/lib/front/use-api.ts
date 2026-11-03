'use client'

import { useMemo } from 'react'
import { createClient } from '@phantera/sdk'
import { useStepUp } from '@/lib/auth/use-step-up'

/**
 * A client whose `stepUp` endpoints open Clerk's verification dialog when the
 * session must verify again, then replay the call (lib/auth/use-step-up).
 * Needs Clerk's provider: available everywhere under the dashboard layout.
 */
export function useApi() {
  const { stepUpFetch } = useStepUp()
  return useMemo(
    () => createClient({ stepUpFetch: ((input, init) => stepUpFetch(String(input), init)) as typeof fetch }),
    [stepUpFetch],
  )
}
