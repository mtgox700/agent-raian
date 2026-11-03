import { describe, expect, it } from 'vitest'
import { partialJsonField } from './partial-json-field'

describe('partialJsonField', () => {
  it('returns nothing until the field starts', () => {
    expect(partialJsonField('{"subject":"Une ques', 'body')).toBe('')
  })

  it('returns the text received so far, unescaped', () => {
    expect(partialJsonField('{"subject":"Hi","body":"Bonjour Zoé,\\n\\nVous dites \\"oui', 'body'))
      .toBe('Bonjour Zoé,\n\nVous dites "oui')
  })

  it('stops at the closing quote', () => {
    expect(partialJsonField('{"body":"Fin.","subject":"x"}', 'body')).toBe('Fin.')
  })

  it('waits when an escape is cut by the stream', () => {
    expect(partialJsonField('{"body":"a\\', 'body')).toBe('a')
    expect(partialJsonField('{"body":"caf\\u00', 'body')).toBe('caf')
    expect(partialJsonField('{"body":"caf\\u00e9', 'body')).toBe('café')
  })
})
