import { afterEach, describe, expect, it } from 'vitest'
import { averageEmailGapSeconds, emailGapSeconds, linkedInGapSeconds } from './pacing'

afterEach(() => {
  delete process.env.EMAIL_MIN_GAP_SECONDS
  delete process.env.EMAIL_GAP_JITTER_SECONDS
  delete process.env.LINKEDIN_MIN_GAP_SECONDS
})

describe('pacing', () => {
  it('draws the email gap between 20 and 45 seconds by default', () => {
    expect(emailGapSeconds(() => 0)).toBe(20)
    expect(emailGapSeconds(() => 1)).toBe(45)
    expect(averageEmailGapSeconds()).toBe(32.5)
  })

  it('0 disables pacing, an invalid value falls back to the default', () => {
    process.env.EMAIL_MIN_GAP_SECONDS = '0'
    expect(emailGapSeconds(() => 0.5)).toBe(0)
    process.env.EMAIL_MIN_GAP_SECONDS = 'abc'
    expect(emailGapSeconds(() => 0)).toBe(20)
  })

  it('spaces LinkedIn actions one to two minutes apart', () => {
    expect(linkedInGapSeconds(() => 0)).toBe(60)
    expect(linkedInGapSeconds(() => 1)).toBe(120)
  })
})
