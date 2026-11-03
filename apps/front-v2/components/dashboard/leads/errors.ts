import { ApiError } from '@phantera/sdk'

/**
 * The server's own words when it gave some (`{ error }`, as body n°1 showed
 * them), the screen's fallback otherwise: never the SDK's technical message.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.body?.error ?? fallback
  return fallback
}
