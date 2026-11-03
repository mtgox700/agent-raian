'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CampaignWizardData, WizardStep1, WizardStep2, WizardStep3, WizardStep4 } from '@/lib/types/campaign-wizard'
import { DEFAULT_WIZARD_DATA } from '@/lib/types/campaign-wizard'

export type WizardStepIndex = 1 | 2 | 3 | 4 | 5

/**
 * A double click on "next" used to skip a step: the second click landed on
 * the next step's own "next" button, at the same place. Step moves closer
 * than this to the previous one are ignored (not persisted).
 */
export const STEP_CHANGE_COOLDOWN_MS = 400
let lastStepChangeAt = 0

function stepChangeAllowed(now: number = Date.now()): boolean {
  if (now - lastStepChangeAt < STEP_CHANGE_COOLDOWN_MS) return false
  lastStepChangeAt = now
  return true
}

interface CampaignWizardState {
  currentStep: WizardStepIndex
  data: CampaignWizardData
  isGeneratingAI: boolean
  isLaunching: boolean
  launchSuccess: boolean

  setStep: (step: WizardStepIndex) => void
  nextStep: () => void
  prevStep: () => void

  updateStep1: (data: Partial<WizardStep1>) => void
  updateStep2: (data: Partial<WizardStep2>) => void
  updateStep3: (data: Partial<WizardStep3>) => void
  updateStep4: (data: Partial<WizardStep4>) => void

  setGeneratingAI: (v: boolean) => void
  setLaunching: (v: boolean) => void
  setLaunchSuccess: (v: boolean) => void

  reset: () => void
}

// Persisted to localStorage: protects against accidental tab refresh / nav.
// Only `currentStep` + `data` are persisted; transient UI flags (isLaunching…)
// reset to their defaults on every page load.
export const useCampaignWizard = create<CampaignWizardState>()(
  persist(
    (set) => ({
      currentStep: 1,
      data: DEFAULT_WIZARD_DATA,
      isGeneratingAI: false,
      isLaunching: false,
      launchSuccess: false,

      setStep: (step) => set({ currentStep: step }),
      nextStep: () => {
        if (!stepChangeAllowed()) return
        set((s) => ({ currentStep: Math.min(s.currentStep + 1, 5) as WizardStepIndex }))
      },
      prevStep: () => {
        if (!stepChangeAllowed()) return
        set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) as WizardStepIndex }))
      },

      updateStep1: (data) => set((s) => ({ data: { ...s.data, step1: { ...s.data.step1, ...data } } })),
      updateStep2: (data) => set((s) => ({ data: { ...s.data, step2: { ...s.data.step2, ...data } } })),
      updateStep3: (data) => set((s) => ({ data: { ...s.data, step3: { ...s.data.step3, ...data } } })),
      updateStep4: (data) => set((s) => ({ data: { ...s.data, step4: { ...s.data.step4, ...data } } })),

      setGeneratingAI: (v) => set({ isGeneratingAI: v }),
      setLaunching: (v) => set({ isLaunching: v }),
      setLaunchSuccess: (v) => set({ launchSuccess: v }),

      reset: () => set({ currentStep: 1, data: DEFAULT_WIZARD_DATA, isGeneratingAI: false, isLaunching: false, launchSuccess: false }),
    }),
    {
      name:    'phantera-campaign-wizard',
      storage: createJSONStorage(() => localStorage),
      // Only persist the form data + current step: never the transient flags.
      partialize: (state) => ({ currentStep: state.currentStep, data: state.data }),
      version: 1,
    },
  ),
)
