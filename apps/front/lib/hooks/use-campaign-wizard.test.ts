import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STEP_CHANGE_COOLDOWN_MS, useCampaignWizard } from './use-campaign-wizard'

let now = 1_000_000

beforeEach(() => {
  now += 10_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  useCampaignWizard.setState({ currentStep: 1 })
})

describe('campaign wizard steps', () => {
  it('a double click on "next" moves one step, not two', () => {
    useCampaignWizard.getState().nextStep()
    now += 80
    useCampaignWizard.getState().nextStep()
    expect(useCampaignWizard.getState().currentStep).toBe(2)
  })

  it('deliberate clicks keep moving forward', () => {
    useCampaignWizard.getState().nextStep()
    now += STEP_CHANGE_COOLDOWN_MS + 1
    useCampaignWizard.getState().nextStep()
    expect(useCampaignWizard.getState().currentStep).toBe(3)
  })

  it('never goes past the last step or before the first', () => {
    useCampaignWizard.setState({ currentStep: 5 })
    useCampaignWizard.getState().nextStep()
    expect(useCampaignWizard.getState().currentStep).toBe(5)
    now += STEP_CHANGE_COOLDOWN_MS + 1
    useCampaignWizard.setState({ currentStep: 1 })
    useCampaignWizard.getState().prevStep()
    expect(useCampaignWizard.getState().currentStep).toBe(1)
  })
})
