import { describe, expect, it } from 'vitest'
import { leadSearchWhere } from './lead-rows'
import { leadMatchesSearch } from './lead-status'
import { signatureInputSchema, parseSignature } from '@/lib/email/signature'
import { formatPercent } from '@/lib/format/percent'

describe('leadSearchWhere', () => {
  it('searches the whole workspace by name, email, company and title', () => {
    const where = leadSearchWhere('w1', '  Moulin ', 'all')
    expect(where.workspaceId).toBe('w1')
    expect(where.status).toBeUndefined()
    const and = where.AND as Array<{ OR: unknown[] }>
    expect(and).toHaveLength(1)
    expect(and[0].OR).toHaveLength(5)
    expect(and[0].OR[0]).toEqual({ firstName: { contains: 'moulin', mode: 'insensitive' } })
  })

  it('finds a full name typed as "Prénom Nom": every word must match a field', () => {
    const and = leadSearchWhere('w1', 'Camille   Martin', 'all').AND as unknown[]
    expect(and).toHaveLength(2)
    expect(leadMatchesSearch({ firstName: 'Camille', lastName: 'Martin', email: 'c@x.fr', company: 'Acme', title: null }, 'camille martin')).toBe(true)
    expect(leadMatchesSearch({ firstName: 'Camille', lastName: 'Durand', email: 'c@x.fr', company: 'Acme', title: null }, 'camille martin')).toBe(false)
  })

  it('counts leads waiting in a queue as new', () => {
    expect(leadSearchWhere('w1', '', 'new').status).toEqual({ in: ['new', 'queued'] })
    expect(leadSearchWhere('w1', '', 'contacted').status).toEqual({ in: ['contacted'] })
  })

  it('ignores an unknown status filter instead of matching nothing', () => {
    expect(leadSearchWhere('w1', '', 'bogus').status).toBeUndefined()
  })
})

describe('signature links', () => {
  const base = { enabled: true, fullName: 'Camille', role: '', company: '', linkedinUrl: '', logoUrl: '', customHtml: '' }

  it('accepts a bare domain or a full address', () => {
    expect(signatureInputSchema.safeParse({ ...base, website: 'entreprise.fr' }).success).toBe(true)
    expect(signatureInputSchema.safeParse({ ...base, website: 'https://www.phantera-tn.com/' }).success).toBe(true)
  })

  it('refuses text that is not a web address', () => {
    expect(signatureInputSchema.safeParse({ ...base, website: 'javascript:alert(1)' }).success).toBe(false)
    expect(signatureInputSchema.safeParse({ ...base, website: 'mon site' }).success).toBe(false)
    expect(signatureInputSchema.safeParse({ ...base, website: '', logoUrl: 'http://x.fr/logo.png' }).success).toBe(false)
  })

  it('still reads a signature saved before the check existed', () => {
    expect(parseSignature({ ...base, website: 'mon site' })?.website).toBe('mon site')
  })
})

describe('formatPercent', () => {
  it('uses a French decimal comma and a non-breaking space', () => {
    expect(formatPercent(72.73)).toBe('72,7 %')
    expect(formatPercent(0)).toBe('0,0 %')
  })
})
