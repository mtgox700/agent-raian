'use client'

/**
 * Onboarding, a single step as in body n°1: the workspace already exists
 * (created at sign-up), so the person names it and onboarding is marked
 * complete (workspace.completeOnboarding), then straight to the dashboard.
 * The ideal client is asked later, in the campaign wizard, where it is used.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Button, Field, Input, describedBy } from '@/components/ui'
import { onboarding as t } from '@/lib/app-copy'
import { api } from '@/lib/front/api'

const FIELD_ID = 'workspace-name'

export function OnboardingForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    const workspaceName = name.trim()
    if (workspaceName.length < 2) { setError(t.tooShort); return }
    setError(null)
    startTransition(async () => {
      try {
        await api.call('workspace.completeOnboarding', { body: { workspaceName } })
        router.push('/dashboard')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t.failed)
      }
    })
  }

  return (
    <div className="w-full max-w-lg rounded-lg border border-line bg-raised p-6 md:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">{t.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-quiet">{t.subtitle}</p>

      <form onSubmit={submit} className="mt-8 space-y-6" noValidate>
        <Field id={FIELD_ID} label={t.label} error={error}>
          <Input
            id={FIELD_ID}
            name="workspaceName"
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(null) }}
            placeholder={t.placeholder}
            maxLength={50}
            autoComplete="organization"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(FIELD_ID, { error })}
          />
        </Field>

        <ol className="border-t border-line">
          {t.nextSteps.map((step, i) => (
            <li key={step} className="flex gap-4 border-b border-line py-3 text-sm leading-relaxed text-ink/85">
              <span className="font-mono text-xs leading-6 text-accent tabular-nums" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              {step}
            </li>
          ))}
        </ol>

        <div>
          <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
            {pending
              ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t.launching}</>
              : <>{t.launch}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
          </Button>
          <p className="mt-3 text-xs text-quiet">{t.later}</p>
        </div>
      </form>
    </div>
  )
}
