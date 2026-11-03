import { describe, it, expect } from 'vitest'
import { mergeInbox, groupByLead } from './unified'
import { agencyWholesaleRate, rollupAgency } from '@/lib/billing/agency'

describe('mergeInbox', () => {
  const emails = [
    { id: 'e1', leadId: 'l1', fromEmail: 'a@x.com', bodyText: 'Intéressé', receivedAt: '2026-06-10T10:00:00Z', classification: 'POSITIVE' },
    { id: 'e2', leadId: 'l2', fromEmail: 'b@x.com', bodyText: 'Pas maintenant', receivedAt: '2026-06-10T12:00:00Z' },
  ]
  const linkedins = [
    { id: 'li1', leadId: 'l1', senderName: 'Jean', text: 'Ok pour un call', receivedAt: '2026-06-10T11:00:00Z' },
  ]

  it('merges channels newest-first', () => {
    const feed = mergeInbox(emails, linkedins)
    expect(feed.map((m) => m.id)).toEqual(['e2', 'li1', 'e1'])
    expect(feed[0].channel).toBe('email')
    expect(feed[1].channel).toBe('linkedin')
  })

  it('normalizes fields and carries classification', () => {
    const feed = mergeInbox(emails, linkedins)
    const e1 = feed.find((m) => m.id === 'e1')!
    expect(e1.fromName).toBe('a@x.com')
    expect(e1.classification).toBe('POSITIVE')
    const li = feed.find((m) => m.id === 'li1')!
    expect(li.classification).toBeNull()
  })

  it('groups by lead', () => {
    const groups = groupByLead(mergeInbox(emails, linkedins))
    expect(groups.get('l1')).toHaveLength(2)
    expect(groups.get('l2')).toHaveLength(1)
  })
})

describe('agency pricing', () => {
  it('applies volume discounts to the wholesale rate', () => {
    expect(agencyWholesaleRate(1000)).toBe(0.1)
    expect(agencyWholesaleRate(5000)).toBe(0.08)
    expect(agencyWholesaleRate(20000)).toBe(0.06)
    expect(agencyWholesaleRate(50000)).toBe(0.05)
  })

  it('rolls up sub-accounts into a consolidated bill', () => {
    const r = rollupAgency([
      { id: 's1', name: 'Client A', activeContacts: 3000 },
      { id: 's2', name: 'Client B', activeContacts: 3000 },
    ])
    expect(r.subAccounts).toBe(2)
    expect(r.totalContacts).toBe(6000)
    expect(r.ratePerContact).toBe(0.08) // >5000 tier
    expect(r.total).toBe(480) // 6000 * 0.08
  })
})
