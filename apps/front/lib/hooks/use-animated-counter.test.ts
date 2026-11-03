import { describe, expect, it } from 'vitest'
import { shouldAnimate } from './use-animated-counter'

const visible = { reducedMotion: false, hidden: false }

describe('shouldAnimate', () => {
  it('only a change, in a visible tab, without reduced motion', () => {
    expect(shouldAnimate(2738, 2738, visible)).toBe(false)
    expect(shouldAnimate(10, 12, visible)).toBe(true)
    expect(shouldAnimate(10, 12, { ...visible, reducedMotion: true })).toBe(false)
    expect(shouldAnimate(10, 12, { ...visible, hidden: true })).toBe(false)
  })
})
