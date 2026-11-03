import { describe, expect, it } from 'vitest'
import { buildAnnotations, describeWeek, kindOf } from './annotations'

const at = new Date('2026-10-20T09:00:00Z')

describe('annotations', () => {
  it('reads a status change as launch, pause, resume or end', () => {
    expect(kindOf(null, 'ACTIVE')).toBe('launch')
    expect(kindOf('DRAFT', 'ACTIVE')).toBe('launch')
    expect(kindOf('PAUSED', 'ACTIVE')).toBe('resume')
    expect(kindOf('ACTIVE', 'PAUSED')).toBe('pause')
    expect(kindOf('ACTIVE', 'COMPLETED')).toBe('complete')
    expect(kindOf(null, 'DRAFT')).toBeNull()
  })

  it('groups by week, oldest first, with the campaign names', () => {
    const weeks = buildAnnotations([
      { campaignId: 'b', fromStatus: 'ACTIVE', toStatus: 'PAUSED', at, week: '2026-10-19' },
      { campaignId: 'a', fromStatus: null, toStatus: 'DRAFT', at, week: '2026-10-12' },
      { campaignId: 'a', fromStatus: 'DRAFT', toStatus: 'ACTIVE', at, week: '2026-10-12' },
      { campaignId: 'c', fromStatus: 'ACTIVE', toStatus: 'PAUSED', at, week: '2026-10-19' },
    ], new Map([['a', 'Alpha'], ['b', 'Beta']]))
    expect(weeks.map((w) => w.week)).toEqual(['2026-10-12', '2026-10-19'])
    expect(weeks[0].events).toEqual([expect.objectContaining({ kind: 'launch', campaign: 'Alpha' })])
    expect(weeks[1].events.map((e) => e.campaign)).toEqual(['Beta', 'Campagne'])
    expect(describeWeek(weeks[1].events)).toBe('Pauses : « Beta », « Campagne »')
    expect(describeWeek([...weeks[1].events, ...weeks[0].events])).toBe('Lancement : « Alpha » ; pauses : « Beta », « Campagne »')
  })
})
