/**
 * Clerk sends everyone to /dashboard or /onboarding after signing in or up
 * (forced redirects). An invited person who has to authenticate first would
 * land in onboarding and create their own workspace. So the invitation page
 * keeps the token in a short-lived cookie before sending them to Clerk; the
 * dashboard and onboarding layouts see it and send them back, once, to the
 * invitation (/invite/resume consumes the cookie).
 */

export const PENDING_INVITE_COOKIE = 'phantera_invite'
export const PENDING_INVITE_MAX_AGE = 60 * 60

export const pendingInviteCookie = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path:     '/',
  maxAge:   PENDING_INVITE_MAX_AGE,
}

/** Whether the layouts should send the visitor back to their invitation. */
export async function hasPendingInvite(): Promise<boolean> {
  const { cookies } = await import('next/headers')
  return Boolean((await cookies()).get(PENDING_INVITE_COOKIE)?.value)
}
