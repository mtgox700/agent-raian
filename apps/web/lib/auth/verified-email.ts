/**
 * The e-mail address that may identify a Phantera account: the Clerk user's
 * PRIMARY address, and only once Clerk has verified it. Linking a database
 * account to a Clerk user by an unverified address would let anyone who adds
 * a victim's address to their own Clerk profile take over the victim's
 * workspaces (internal pentest F1, 2026-10-17).
 */

interface ClerkLikeUser {
  primaryEmailAddress?: { emailAddress: string; verification?: { status?: string | null } | null } | null
}

export function verifiedPrimaryEmail(user: ClerkLikeUser | null | undefined): string | null {
  const primary = user?.primaryEmailAddress
  if (!primary?.emailAddress) return null
  return primary.verification?.status === 'verified' ? primary.emailAddress : null
}
