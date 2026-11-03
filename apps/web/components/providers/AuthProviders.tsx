import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { frFR } from '@clerk/localizations'
import { themeByKey } from '@phantera/themes'
import { brand } from '@/lib/brand'
import { PostHogIdentify } from '@/components/providers/PostHogIdentify'
import { SessionRefetch } from '@/components/providers/SessionRefetch'

const theme = themeByKey(brand.key)

/**
 * AuthProviders: Clerk context, scoped to authenticated route groups only.
 *
 * Mounted in (auth) and (dashboard) layouts, NOT in the root layout, so the
 * public marketing pages (/, /about, /legal/*) never ship the Clerk client SDK.
 * This keeps the landing's First Load JS small (PSA-5b) while every authed
 * surface still gets full Clerk + the Clerk ->PostHog identity bridge.
 */
export function AuthProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      // Rendered per request: Clerk reads the CSP nonce set by the middleware
      // (lib/security/csp) and puts it on the script that loads clerk-js;
      // without it the strict policy blocks Clerk.
      dynamic
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/onboarding"
      // Clerk's own screens (sign-in, account menu, verification codes) in French.
      localization={frFR}
      // Clerk widgets follow the brand theme (packages/themes, `auth` palette).
      appearance={{
        ...(brand.mode === 'dark' ? { baseTheme: dark } : {}),
        variables: {
          colorPrimary: brand.colors.primary,
          colorBackground: theme.auth.background,
          colorInputBackground: theme.auth.inputBackground,
          colorInputText: theme.auth.inputText,
          colorText: theme.auth.text,
          colorTextSecondary: theme.auth.textSecondary,
          colorDanger: theme.auth.danger,
          borderRadius: theme.auth.radius,
          fontFamily: 'var(--font-inter)',
        },
      }}
    >
      {/* Identify authenticated Clerk users in PostHog (needs Clerk context) */}
      <PostHogIdentify />
      {/* An API call made with an expired token is retried after a refresh. */}
      <SessionRefetch />
      {children}
    </ClerkProvider>
  )
}
