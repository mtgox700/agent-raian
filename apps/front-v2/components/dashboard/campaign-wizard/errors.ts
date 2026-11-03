import { ApiError } from '@phantera/sdk'

/**
 * The words to show for a failed call: the back's message, or the first rule
 * of the contract the input broke (the SDK checks the body before sending,
 * with the same messages the back would answer), or `network`.
 */
export function callErrorText(err: unknown, fallback: string, network: string): string {
  if (err instanceof ApiError) return err.body?.error ?? fallback
  if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as { issues: unknown }).issues)) {
    const first = (err as { issues: Array<{ message?: string }> }).issues[0]
    if (first?.message) return first.message
  }
  return network
}
