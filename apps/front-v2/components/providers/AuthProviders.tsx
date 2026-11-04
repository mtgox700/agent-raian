import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { frFR } from '@clerk/localizations'
import { themeByKey } from '@phantera/themes'
import { brand } from '@/lib/brand'
import { PostHogIdentify } from '@/components/providers/PostHogIdentify'
import { SessionRefetch } from '@/components/providers/SessionRefetch'

const theme = themeByKey(brand.key)

/**
 * Clerk context, mounted by the (auth) and (dashboard) layouts only, as in
 * body n°1: the landing never ships the Clerk client SDK. Also the Clerk ->
 * PostHog identity bridge and the expired-session retry.
 * Widgets follow the brand theme's `auth` palette; layout classes use tokens.
 */
export function AuthProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      dynamic
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/onboarding"
      localization={frFR}
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
        elements: {
          rootBox: 'w-full max-w-md',
          cardBox: 'w-full rounded-lg border border-line shadow-none',
          formButtonPrimary: 'bg-accent text-canvas hover:bg-accent-strong',
          footerActionLink: 'text-accent hover:text-accent-strong',
        },
      }}
    >
      {/* Identify authenticated Clerk users in PostHog (needs Clerk context; nothing before consent). */}
      <PostHogIdentify />
      {/* An API call made with an expired token is retried after a refresh. */}
      <SessionRefetch />
      {children}
    </ClerkProvider>
  )
}
