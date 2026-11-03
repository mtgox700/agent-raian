import type { Metadata } from 'next'
import { SignUp } from '@clerk/nextjs'
import { identity } from '@/lib/content'

export const metadata: Metadata = { title: identity.cta.primary, robots: { index: false } }

/**
 * Clerk's prebuilt form (body n°1 used Clerk Elements, beta): it covers every
 * strategy, the CAPTCHA and email codes, in French and in the brand palette.
 */
export default function SignUpPage() {
  return <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
}
