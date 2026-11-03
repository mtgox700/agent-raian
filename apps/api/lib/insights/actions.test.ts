import { describe, expect, it } from 'vitest'
import { impactOf, isActionKind } from './actions'

const NOW = new Date('2026-10-19T18:00:00Z')
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000)

describe('actions', () => {
  it('only known actions', () => {
    expect(isActionKind('pause')).toBe(true)
    expect(isActionKind('delete_everything')).toBe(false)
    expect(isActionKind('toString')).toBe(false)
  })

  it('a pause works when nothing left since', () => {
    expect(impactOf({ action: 'pause', createdAt: at(2), revertedAt: null }, 0, NOW).state).toBe('mesuré')
    expect(impactOf({ action: 'pause', createdAt: at(2), revertedAt: null }, 3, NOW)).toMatchObject({ state: 'sans effet' })
  })

  it('a new sender: too early within a day, then measured or said to have failed', () => {
    expect(impactOf({ action: 'change_sender', createdAt: at(3), revertedAt: null }, 0, NOW).state).toBe('trop tôt')
    expect(impactOf({ action: 'change_sender', createdAt: at(3), revertedAt: null }, 12, NOW).text).toContain('12 emails')
    expect(impactOf({ action: 'change_sender', createdAt: at(30), revertedAt: null }, 0, NOW)).toMatchObject({ state: 'sans effet' })
  })

  it('an undone action says so, whatever happened after', () => {
    expect(impactOf({ action: 'pause', createdAt: at(30), revertedAt: at(1) }, 9, NOW).state).toBe('annulé')
  })
})
