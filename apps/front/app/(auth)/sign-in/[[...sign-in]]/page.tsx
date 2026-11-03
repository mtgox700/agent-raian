import { SignIn } from '@clerk/nextjs'
import { headers } from 'next/headers'
import { safeReturnPath } from '@/lib/security/signed-out'
import { SignInGate } from '@/components/auth/SignInGate'

/**
 * Sign-in uses Clerk's prebuilt component, not Clerk Elements: Elements (beta)
 * does not handle every verification Clerk can require. A sign-in from a new
 * device triggers Clerk's client-trust check, which ended on an empty card and
 * then on "The verification strategy is not valid for this account": users
 * could only sign in from a browser Clerk already trusted. The prebuilt flow
 * covers new-device codes, second factors, password reset and every other
 * strategy, and follows the brand theme and French locale set in AuthProviders.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? ''}`
  // Also where the form sends someone it finds already signed in: the page
  // asked for, checked like the middleware does (this site only).
  const back = safeReturnPath((await searchParams).redirect_url, origin)
  return (
    <SignInGate to={back}>
    <SignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      // A fallback, not a force: the page asked for (an expired session, a plan
      // to buy, an invitation) comes back after sign-in.
      fallbackRedirectUrl={back}
      appearance={{
        elements: {
          rootBox: 'w-full max-w-md',
          cardBox: 'w-full shadow-[0_24px_80px_rgba(0,0,0,0.45)]',
          card: 'w-full border border-border/60',
        },
      }}
    />
    </SignInGate>
  )
}
