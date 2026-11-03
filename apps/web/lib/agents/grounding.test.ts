import { describe, it, expect } from 'vitest'
import { checkGrounding, groundingNote } from './grounding'

const facts = [
  'Industry: SaaS',
  'Value proposition: we cut prospecting time in half',
  'Target titles: CEO, CTO',
]

describe('checkGrounding', () => {
  it('passes copy with no invented figures', () => {
    const body = 'Bonjour {{firstName}}, j’ai vu que {{company}} scale son équipe sales. Ouvert à un échange ?'
    expect(checkGrounding({ body, sourceFacts: facts }).ok).toBe(true)
  })

  it('flags an invented percentage', () => {
    const body = 'Nos clients augmentent leurs réponses de 47% en moyenne.'
    const r = checkGrounding({ body, sourceFacts: facts })
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.kind === 'PERCENTAGE' && i.value.includes('47'))).toBe(true)
  })

  it('flags an invented currency amount', () => {
    const body = 'Vous économiseriez 50 000€ par an avec notre solution.'
    const r = checkGrounding({ body, sourceFacts: facts })
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.kind === 'CURRENCY')).toBe(true)
  })

  it('flags an invented multiplier/number', () => {
    const body = 'On a aidé 250 entreprises à doubler leur pipeline.'
    const r = checkGrounding({ body, sourceFacts: facts })
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.value.includes('250'))).toBe(true)
  })

  it('does not flag a figure that appears in the source facts', () => {
    const grounded = checkGrounding({
      body: 'We help SaaS teams cut prospecting time by 50%.',
      sourceFacts: ['Value proposition: cut prospecting time by 50%'],
    })
    expect(grounded.ok).toBe(true)
  })

  it('ignores placeholders and single digits', () => {
    const body = 'Bonjour {{firstName}}, une question rapide pour {{company}} ?'
    expect(checkGrounding({ body, sourceFacts: facts }).ok).toBe(true)
  })

  it('de-dupes repeated claims', () => {
    const body = '47% de hausse, vraiment 47% de hausse.'
    const r = checkGrounding({ body, sourceFacts: facts })
    expect(r.issues.filter((i) => i.value.includes('47')).length).toBe(1)
  })
})

describe('groundingNote', () => {
  it('is empty when grounded', () => {
    expect(groundingNote({ ok: true, issues: [] })).toBe('')
  })
  it('lists the offending claims', () => {
    const note = groundingNote({ ok: false, issues: [{ kind: 'PERCENTAGE', value: '47%', context: '…' }] })
    expect(note).toContain('47%')
    expect(note.toLowerCase()).toContain('ungrounded')
  })
})
