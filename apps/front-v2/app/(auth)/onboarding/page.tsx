import type { Metadata } from 'next'
import { OnboardingForm } from '@/components/onboarding/OnboardingForm'
import { onboarding } from '@/lib/app-copy'

export const metadata: Metadata = { title: onboarding.title }

/** One step: name the workspace (created at sign-up), then the dashboard. */
export default function OnboardingPage() {
  return <OnboardingForm />
}
