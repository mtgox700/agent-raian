import { describe, expect, it } from 'vitest'
import { humanPunctuation } from './human-punctuation'

describe('humanPunctuation', () => {
  it('turns an aside dash into a comma', () => {
    expect(humanPunctuation('Bonjour Marc — j’ai vu votre levée')).toBe('Bonjour Marc, j’ai vu votre levée')
    expect(humanPunctuation('Un point—puis un autre')).toBe('Un point, puis un autre')
  })

  it('keeps a range a range', () => {
    expect(humanPunctuation('entre 10–20 salariés, de 9 — 18 h')).toBe('entre 10-20 salariés, de 9-18 h')
  })

  it('a dash opening a line is a list item', () => {
    expect(humanPunctuation('Points :\n— le ciblage\n  – la boîte')).toBe('Points :\n- le ciblage\n  - la boîte')
  })

  it('an arrow in running text becomes a colon', () => {
    expect(humanPunctuation('Que faire → reconnecter la boîte')).toBe('Que faire : reconnecter la boîte')
  })

  it('leaves no doubled punctuation behind', () => {
    expect(humanPunctuation('Merci, — vraiment')).toBe('Merci, vraiment')
    expect(humanPunctuation('Fin —')).toBe('Fin')
  })

  it('touches nothing else', () => {
    const plain = 'Taux de réponse : 4,5 % (12/300) ; à surveiller.'
    expect(humanPunctuation(plain)).toBe(plain)
  })
})
