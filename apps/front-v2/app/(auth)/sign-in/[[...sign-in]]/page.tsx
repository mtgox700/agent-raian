import type { Metadata } from 'next'
import { SignIn } from '@clerk/nextjs'
import { headers } from 'next/headers'
import { safeReturnPath } from '@/lib/security/signed-out'
import { SignInGate } from '@/components/auth/SignInGate'
import { identity } from '@/lib/content'

export const metadata: Metadata = { title: identity.cta.signIn, robots: { index: false } }

/**
 * Clerk's prebuilt form, as in body n°1: it handles every verification Clerk
 * may require (new device, second factor, reset). The page asked for comes back
 * after sign-in (checked: this site only).
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? ''}`
  const back = safeReturnPath((await searchParams).redirect_url, origin)
  return (
    <SignInGate to={back}>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl={back} />
    </SignInGate>
  )
}
