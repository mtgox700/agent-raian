'use client'

import * as Clerk from '@clerk/elements/common'
import * as SignUp from '@clerk/elements/sign-up'
import { useSignUp } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, Lock, User, CheckCircle2 } from 'lucide-react'
import { AuthCard } from '@/components/auth/AuthCard'
import { brand } from '@/lib/brand'
import { AuthInput } from '@/components/auth/AuthInput'
import { AuthButton } from '@/components/auth/AuthButton'
import { AuthDivider } from '@/components/auth/AuthDivider'

// ─── Continue step: reads missingFields and collects whatever Clerk requires ──
function ContinueStep() {
  const { isLoaded, signUp, setActive } = useSignUp()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  const missingFields = signUp?.missingFields ?? []
  const needsFirstName = missingFields.includes('first_name')
  const needsLastName  = missingFields.includes('last_name')

  // Auto-redirect if already complete
  useEffect(() => {
    if (!isLoaded || !signUp) return
    if (signUp.status === 'complete' && signUp.createdSessionId) {
      setActive({ session: signUp.createdSessionId }).then(() => router.push('/onboarding'))
    }
  }, [isLoaded, signUp, setActive, router])

  const setField = (key: string, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const handleComplete = async () => {
    if (!isLoaded || !signUp) return
    setLoading(true)
    setError(null)
    try {
      // Build update payload with only what Clerk says is missing
      const updateData: Record<string, string> = {}
      if (needsFirstName) updateData.firstName = fields['first_name'] ?? ''
      if (needsLastName)  updateData.lastName  = fields['last_name']  ?? ''

      const result = await signUp.update(updateData)

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId })
        router.push('/onboarding')
      } else {
        setError('Il manque encore une information pour créer votre compte. Vérifiez les champs, puis réessayez.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue. Réessayez dans un instant.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Presque terminé" subtitle="Complétez les champs ci-dessous pour finaliser votre compte.">
      <div className="w-full space-y-5">
        <div className="flex items-center justify-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <span className="text-sm text-green-400">E-mail vérifié</span>
        </div>

        {needsFirstName && (
          <AuthInput
            label="Prénom"
            type="text"
            placeholder="Camille"
            icon={<User className="h-4 w-4" />}
            value={fields['first_name'] ?? ''}
            onChange={(e) => setField('first_name', e.target.value)}
          />
        )}

        {needsLastName && (
          <AuthInput
            label="Nom"
            type="text"
            placeholder="Martin"
            value={fields['last_name'] ?? ''}
            onChange={(e) => setField('last_name', e.target.value)}
          />
        )}

        {/* Fallback: show raw missing fields if unexpected */}
        {missingFields.filter(f => f !== 'first_name' && f !== 'last_name').map((f) => (
          <AuthInput
            key={f}
            label={f.replace(/_/g, ' ')}
            type="text"
            placeholder={f.replace(/_/g, ' ')}
            value={fields[f] ?? ''}
            onChange={(e) => setField(f, e.target.value)}
          />
        ))}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <AuthButton onClick={handleComplete} loading={loading}>
          Entrer dans {brand.name}
        </AuthButton>
      </div>
    </AuthCard>
  )
}

// ─── Main sign-up page ────────────────────────────────────────────────────────
export default function SignUpPage() {
  return (
    <SignUp.Root routing="path" path="/sign-up">
      {/* Step 1 — Registration form */}
      <SignUp.Step name="start">
        <AuthCard
          title="Créez votre compte"
          subtitle="Lancez votre prospection en quelques minutes"
        >
          <div className="w-full space-y-5">
            {/* Google OAuth */}
            <Clerk.Connection name="google" asChild>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-border/60 bg-obsidian/60 px-4 py-3 text-sm font-medium text-white transition-all duration-200 hover:border-cyan/25 hover:bg-surface/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continuer avec Google
              </button>
            </Clerk.Connection>

            <AuthDivider />

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Clerk.Field name="firstName">
                  <Clerk.Label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted">
                    Prénom
                  </Clerk.Label>
                  <Clerk.Input asChild>
                    <AuthInput type="text" placeholder="Camille" icon={<User className="h-4 w-4" />} />
                  </Clerk.Input>
                  <Clerk.FieldError className="mt-1.5 text-xs text-red-400" />
                </Clerk.Field>

                <Clerk.Field name="lastName">
                  <Clerk.Label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted">
                    Nom
                  </Clerk.Label>
                  <Clerk.Input asChild>
                    <AuthInput type="text" placeholder="Martin" />
                  </Clerk.Input>
                  <Clerk.FieldError className="mt-1.5 text-xs text-red-400" />
                </Clerk.Field>
              </div>

              <Clerk.Field name="emailAddress">
                <Clerk.Label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted">
                  E-mail professionnel
                </Clerk.Label>
                <Clerk.Input asChild>
                  <AuthInput type="email" placeholder="vous@entreprise.fr" icon={<Mail className="h-4 w-4" />} />
                </Clerk.Input>
                <Clerk.FieldError className="mt-1.5 text-xs text-red-400" />
              </Clerk.Field>

              <Clerk.Field name="password">
                <Clerk.Label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted">
                  Mot de passe
                </Clerk.Label>
                <Clerk.Input asChild>
                  <AuthInput type="password" placeholder="8 caractères minimum" icon={<Lock className="h-4 w-4" />} />
                </Clerk.Input>
                <Clerk.FieldError className="mt-1.5 text-xs text-red-400" />
              </Clerk.Field>
            </div>

            <p className="text-center text-xs text-muted/70">
              En créant un compte, vous acceptez nos{' '}
              <Link href="/legal/terms" className="text-cyan/70 hover:text-cyan">conditions d&apos;utilisation</Link>{' '}
              et notre{' '}
              <Link href="/legal/privacy" className="text-cyan/70 hover:text-cyan">politique de confidentialité</Link>.
            </p>

            <Clerk.GlobalError className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400" />

            {/* Clerk Smart CAPTCHA mount node — required for bot protection on
                custom sign-up flows. Without it Clerk warns and falls back to the
                invisible widget, which can block real signups in production.
                `empty:hidden` keeps it invisible until Clerk injects the widget. */}
            <div id="clerk-captcha" className="empty:hidden" />

            <SignUp.Action submit asChild>
              <AuthButton type="submit">Créer mon compte gratuit</AuthButton>
            </SignUp.Action>

            <p className="text-center text-sm text-muted">
              Déjà un compte ?{' '}
              <Link href="/sign-in" className="font-medium text-cyan hover:text-cyan/80">
                Se connecter
              </Link>
            </p>
          </div>
        </AuthCard>
      </SignUp.Step>

      {/* Step 2 — Email verification (OTP) */}
      <SignUp.Step name="verifications">
        <SignUp.Strategy name="email_code">
          <AuthCard
            title="Vérifiez vos e-mails"
            subtitle="Nous vous avons envoyé un code à 6 chiffres"
          >
            <div className="w-full space-y-6">
              <Clerk.Field name="code">
                <Clerk.Label className="mb-3 block text-center text-xs font-medium uppercase tracking-widest text-muted">
                  Code de vérification
                </Clerk.Label>
                <Clerk.Input
                  type="otp"
                  autoSubmit
                  className="flex justify-center gap-2"
                  render={({ value, status }) => (
                    <div
                      data-status={status}
                      className="flex h-12 w-12 items-center justify-center rounded-lg border border-border/60 bg-obsidian text-lg font-bold text-white transition-all data-[status=selected]:border-cyan/60 data-[status=selected]:shadow-[0_0_0_3px_rgba(var(--brand-primary-rgb),0.1)] data-[status=cursor]:border-cyan/60"
                    >
                      {value}
                    </div>
                  )}
                />
                <Clerk.FieldError className="mt-3 text-center text-xs text-red-400" />
              </Clerk.Field>

              <Clerk.GlobalError className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400" />

              <SignUp.Action submit asChild>
                <AuthButton type="submit">Vérifier mon e-mail</AuthButton>
              </SignUp.Action>

              <p className="text-center text-xs text-muted/70">
                Code non reçu ?{' '}
                <SignUp.Action resend asChild>
                  <button type="button" className="text-cyan/70 hover:text-cyan">
                    Renvoyer
                  </button>
                </SignUp.Action>
              </p>
            </div>
          </AuthCard>
        </SignUp.Strategy>
      </SignUp.Step>

      {/* Step 3 — Continue (imperative completion, bypasses Clerk Elements limitation) */}
      <SignUp.Step name="continue">
        <ContinueStep />
      </SignUp.Step>
    </SignUp.Root>
  )
}
