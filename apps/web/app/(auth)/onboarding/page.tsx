'use client'

/**
 * Onboarding: single, frictionless step.
 *
 * The workspace is already auto-created at sign-up (Clerk `user.created` webhook),
 * so onboarding only needs to (a) let the user name it and (b) flip
 * `onboardingCompleted`. ICP/targeting is collected later in the campaign wizard
 * where it's actually used: no redundant steps, fastest possible time-to-value.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, AlertCircle } from 'lucide-react'
import { brand } from '@/lib/brand'
import { AuthCard } from '@/components/auth/AuthCard'
import { AuthInput } from '@/components/auth/AuthInput'
import { AuthButton } from '@/components/auth/AuthButton'
import { completeOnboarding } from './actions'

// What happens after this screen, said plainly (the old pillars promised
// "prospects ciblés en temps réel").
const NEXT_STEPS = [
  'Décrivez votre client idéal : les agents trouvent et notent les leads.',
  'Écrivez ou relisez la séquence, avec les variables qui la personnalisent pour chaque lead.',
  'Lancez : la séquence s’arrête dès qu’un prospect répond.',
]

export default function OnboardingPage() {
  const router = useRouter()
  const [workspaceName, setWorkspaceName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleLaunch = () => {
    const name = workspaceName.trim()
    if (name.length < 2) {
      setError('Le nom doit faire au moins 2 caractères')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await completeOnboarding({ workspaceName: name })
      if (result.success) {
        // Straight to the dashboard: no auto-prospecting overlay. The user
        // creates their first campaign from there (ICP captured in the wizard).
        router.push('/dashboard')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <AuthCard
      title={`Bienvenue dans ${brand.name}`}
      subtitle="Nommez votre espace de travail. Le reste se règle dans votre première campagne."
      maxWidth="max-w-lg"
    >
      <div className="space-y-6">
        {/* Workspace name */}
        <div>
          <AuthInput
            label="Nom de l'espace de travail"
            value={workspaceName}
            onChange={(e) => {
              setWorkspaceName(e.target.value)
              if (error) setError(null)
            }}
            placeholder="ex: Acme Corp"
            maxLength={50}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && !isPending && handleLaunch()}
          />
          {error && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-danger" role="alert">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {error}
            </div>
          )}
        </div>

        <ol className="border-t border-border">
          {NEXT_STEPS.map((step, i) => (
            <li key={step} className="flex gap-4 border-b border-border py-3 text-sm leading-relaxed text-white/85">
              <span className="font-mono text-xs leading-6 text-cyan tabular-nums" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              {step}
            </li>
          ))}
        </ol>

        {/* CTA */}
        <div>
          <AuthButton onClick={handleLaunch} loading={isPending}>
            {!isPending && (
              <>
                {`Lancer ${brand.name}`}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
            {isPending && 'Création de votre espace…'}
          </AuthButton>
          <p className="mt-3 text-xs text-muted">
            Vous pourrez tout configurer ensuite dans vos campagnes.
          </p>
        </div>
      </div>
    </AuthCard>
  )
}
