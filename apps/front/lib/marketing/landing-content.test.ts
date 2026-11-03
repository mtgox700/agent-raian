import { describe, expect, it } from 'vitest'
import { documents, fileSource } from '@phantera/content'

const brands = ['phantera', 'sparx'] as const
const docs = ['navigation', 'landing', 'faq'] as const

describe('landing content documents', () => {
  for (const brand of brands) {
    for (const doc of docs) {
      it(`${brand}/fr/${doc} exists and parses`, () => {
        const parsed = fileSource.get(brand, 'fr', doc)
        expect(parsed).not.toBeNull()
        expect(() => documents[doc].parse(parsed)).not.toThrow()
      })
    }
  }

  it('Spar-x hides the Phantera-only sections, Phantera shows them', () => {
    const phantera = fileSource.get('phantera', 'fr', 'landing')!
    const sparx = fileSource.get('sparx', 'fr', 'landing')!
    expect(phantera.showLatestArticles).toBe(true)
    expect(phantera.signature).not.toBeNull()
    expect(phantera.features.productShots).toHaveLength(3)
    expect(sparx.showLatestArticles).toBe(false)
    expect(sparx.signature).toBeNull()
    expect(sparx.features.productShots).toBeNull()
  })

  it('every brand names itself, never the other', () => {
    for (const [brand, name, other] of [['phantera', 'Phantera', 'Spar-x'], ['sparx', 'Spar-x', 'Phantera']] as const) {
      const text = JSON.stringify([fileSource.get(brand, 'fr', 'landing'), fileSource.get(brand, 'fr', 'faq'), fileSource.get(brand, 'fr', 'navigation')])
      expect(text).toContain(name)
      expect(text).not.toContain(other)
    }
  })
})
