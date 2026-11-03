import { describe, expect, it } from 'vitest'
import { buildFacts, SCENARIOS } from '@/lib/analyst/evals/fixtures'
import { detectCampaign, detectWorkspace, type CampaignSignals } from './detect'

const NOW = new Date('2026-10-19T09:00:00Z')
const HOUR = 3_600_000
const quiet: CampaignSignals = {
  oldestPendingAt: null,
  recentBounces: { attempted: 200, bounced: 2 },
  replies: { recent: { replied: 6, mature: 200 }, before: { replied: 12, mature: 400 } },
}
const kinds = (xs: { kind: string }[]) => xs.map((x) => x.kind)

describe('detectCampaign', () => {
  it('a healthy campaign raises nothing (no false positive)', () => {
    for (const s of SCENARIOS.filter((x) => x.name.startsWith('saine'))) {
      expect(detectCampaign(s.facts, quiet, NOW), s.name).toEqual([])
    }
  })

  it('a stalled campaign is blocking, with the facts engine’s cause and remedy', () => {
    const facts = SCENARIOS.find((s) => s.name === 'bloquée par une boîte déconnectée')!.facts
    const [a] = detectCampaign(facts, { ...quiet, oldestPendingAt: new Date(NOW.getTime() - 48 * HOUR) }, NOW)
    expect(a).toMatchObject({ kind: 'campagne_immobile', severity: 'bloquant', key: 'campagne_immobile:c', notify: true })
    // The known cause is enough: no second alert for the same queue.
    expect(kinds(detectCampaign(facts, { ...quiet, oldestPendingAt: new Date(NOW.getTime() - 48 * HOUR) }, NOW))).not.toContain('file_bloquee')
  })

  it('a queue stuck for a day with no known cause, never a chosen pause', () => {
    const facts = buildFacts({ ageDays: 10, steps: [{ sent: 100, replies: 3, queued: 40 }] })
    expect(kinds(detectCampaign(facts, { ...quiet, oldestPendingAt: new Date(NOW.getTime() - 30 * HOUR) }, NOW))).toContain('file_bloquee')
    expect(kinds(detectCampaign(facts, { ...quiet, oldestPendingAt: new Date(NOW.getTime() - 5 * HOUR) }, NOW))).not.toContain('file_bloquee')
    // Right after a sender change from an alert, a day of grace.
    expect(kinds(detectCampaign(facts, { ...quiet, oldestPendingAt: new Date(NOW.getTime() - 30 * HOUR), senderChangedAt: new Date(NOW.getTime() - 2 * HOUR) }, NOW))).not.toContain('file_bloquee')
    expect(kinds(detectCampaign(facts, { ...quiet, oldestPendingAt: new Date(NOW.getTime() - 60 * HOUR), senderChangedAt: new Date(NOW.getTime() - 30 * HOUR) }, NOW))).toContain('file_bloquee')
    const paused = SCENARIOS.find((s) => s.name === 'en pause avec une file')!.facts
    expect(kinds(detectCampaign(paused, { ...quiet, oldestPendingAt: new Date(NOW.getTime() - 72 * HOUR) }, NOW))).toEqual([])
  })

  it('recent bounces only, and from 50 emails', () => {
    const facts = SCENARIOS[0].facts
    expect(kinds(detectCampaign(facts, { ...quiet, recentBounces: { attempted: 120, bounced: 12 } }, NOW))).toEqual(['rebonds_en_hausse'])
    expect(kinds(detectCampaign(facts, { ...quiet, recentBounces: { attempted: 30, bounced: 6 } }, NOW))).toEqual([])
  })

  it('a reply drop proven by the test, not a small dip', () => {
    const facts = SCENARIOS[0].facts
    const drop = detectCampaign(facts, { ...quiet, replies: { recent: { replied: 4, mature: 400 }, before: { replied: 40, mature: 400 } } }, NOW)
    expect(kinds(drop)).toEqual(['reponse_en_chute'])
    expect(drop[0].evidence[2]).toContain('démontré')
    expect(detectCampaign(facts, { ...quiet, replies: { recent: { replied: 9, mature: 300 }, before: { replied: 14, mature: 300 } } }, NOW)).toEqual([])
  })

  it('a mailbox slowed by its provider is shown but not notified twice', () => {
    const facts = buildFacts({ ageDays: 10, steps: [{ sent: 100, replies: 3, queued: 40 }], hold: 'MAILBOX_PAUSED' })
    const withResume = { ...facts, sendStatus: { ...facts.sendStatus, resumesAt: new Date(NOW.getTime() + 2 * HOUR).toISOString() } }
    const [a] = detectCampaign(withResume, quiet, NOW)
    expect(a).toMatchObject({ kind: 'boite_en_pause', notify: false })
  })
})

describe('actions offered', () => {
  it('a new sender only for a sender problem; never for a used quota', () => {
    const disconnected = SCENARIOS.find((s) => s.name === 'bloquée par une boîte déconnectée')!.facts
    expect(detectCampaign(disconnected, quiet, NOW)[0].actions).toEqual(['change_sender'])
    const quota = SCENARIOS.find((s) => s.name === 'quota du plan atteint')!.facts
    expect(detectCampaign(quota, quiet, NOW)[0]).toMatchObject({ kind: 'campagne_immobile', actions: [] })
  })

  it('a pause only for a campaign that sends', () => {
    const facts = SCENARIOS[0].facts
    const bounces = { ...quiet, recentBounces: { attempted: 120, bounced: 12 } }
    expect(detectCampaign(facts, bounces, NOW)[0].actions).toEqual(['pause'])
    const paused = { ...facts, campaign: { ...facts.campaign, status: 'PAUSED' } }
    expect(detectCampaign(paused, bounces, NOW)[0].actions).toEqual([])
  })
})

describe('detectWorkspace', () => {
  it('from 80 % of the monthly sends, once per month; never on an unlimited plan', () => {
    expect(detectWorkspace({ current: 79, limit: 100, planName: 'Starter' }, '2026-10')).toEqual([])
    expect(detectWorkspace({ current: 85, limit: 100, planName: 'Starter' }, '2026-10')[0]).toMatchObject({ key: 'quota_envoi_proche:2026-10', severity: 'alerte' })
    expect(detectWorkspace({ current: 100, limit: 100, planName: 'Starter' }, '2026-10')[0].severity).toBe('bloquant')
    // Beyond the limit, the real share: never rounded down to 100 %.
    expect(detectWorkspace({ current: 140, limit: 100, planName: 'Starter' }, '2026-10')[0].evidence[0]).toContain('(140 %)')
    expect(detectWorkspace({ current: 10_000, limit: Infinity, planName: 'Entreprise' }, '2026-10')).toEqual([])
  })
})
