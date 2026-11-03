import { describe, expect, it } from 'vitest'
import { messageFeatures } from './message'

describe('messageFeatures', () => {
  const steps = [
    { position: 2, dayOffset: 7, channel: 'EMAIL', subject: 'Relance', body: 'Avez-vous vu mon message ? Voici le lien https://acme.fr/demo' },
    { position: 1, dayOffset: 0, channel: 'EMAIL', subject: 'Question pour {{company}} ?', body: 'Bonjour {{firstName}}, une question rapide : est-ce un sujet chez {{company}} ?' },
  ]
  const [first, second] = messageFeatures(steps)

  it('orders steps and measures the gap between them', () => {
    expect([first.position, second.position]).toEqual([1, 2])
    expect([first.gapDays, second.gapDays]).toEqual([0, 7])
  })

  it('counts words (a variable is one word), questions and links', () => {
    expect(first.words).toBe(12)
    expect(first.questions).toBe(1)
    expect(second.links).toBe(1)
    expect(first.links).toBe(0)
  })

  it('lists personalisation and describes the subject', () => {
    expect(first.personalisation).toEqual(['company', 'firstName'])
    expect(first).toMatchObject({ subjectWords: 4, subjectQuestion: true, subjectPersonalised: true })
    expect(second).toMatchObject({ subjectQuestion: false, subjectPersonalised: false, personalisation: [] })
  })

  it('an empty body is zero words, not one', () => {
    expect(messageFeatures([{ position: 1, dayOffset: 0, channel: 'LINKEDIN', subject: '', body: '  ' }])[0].words).toBe(0)
  })
})
