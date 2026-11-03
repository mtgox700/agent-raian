import { describe, expect, it } from 'vitest'
import { classifyByKeywords, isAutoReply } from './reply-heuristics'

describe('isAutoReply', () => {
  it.each([
    ['Réponse automatique : Votre prospection', 'Je suis absente du bureau jusqu’au 14 octobre.'],
    ['Automatic reply: Quick question', 'I am currently out of the office with limited access to email.'],
    ['Out of Office', 'Back on Monday.'],
    ['Re: Question', 'Bonjour, je suis en congés et serai de retour le 20 octobre.'],
    ['Absence', 'Merci pour votre message.'],
    ['Absence : Votre prospection', 'Merci pour votre message.'],
  ])('detects "%s"', (subject, body) => {
    expect(isAutoReply(subject, body)).toBe(true)
  })

  it.each([
    ['Re: Question', 'Oui, je suis disponible jeudi pour en parler.'],
    ['Re: Question', 'Pas intéressé, merci.'],
    ['Re: Votre offre', 'I was out of office last week, but yes, let us talk.'],
    ['Re: Gestion des absences', 'Oui, intéressé, appelons-nous.'],
    ["Re: votre question sur l'absence de suivi", 'Je serai de retour le 15, rappelez-moi.'],
  ])('keeps a human reply: "%s"', (subject, body) => {
    expect(isAutoReply(subject, body)).toBe(false)
  })
})

describe('classifyByKeywords', () => {
  it.each([
    ['Stop, merci de ne plus me contacter.', 'NOT_INTERESTED'],
    ['Please unsubscribe me.', 'NOT_INTERESTED'],
    ['Pas intéressé pour le moment.', 'NEGATIVE'],
    ['Not interested, thanks.', 'NEGATIVE'],
    ['Avec plaisir, quel créneau jeudi ?', 'MEETING_REQUEST'],
    ['Can we book a call next week?', 'MEETING_REQUEST'],
    ['Intéressé, envoyez-moi plus d’infos.', 'POSITIVE'],
    ['Sounds interesting, tell me more.', 'POSITIVE'],
  ])('"%s" → %s', (body, expected) => {
    expect(classifyByKeywords(body)).toBe(expected)
  })

  it('does not read a meeting request into a refusal or a full schedule', () => {
    expect(classifyByKeywords("Please don't call me.")).not.toBe('MEETING_REQUEST')
    expect(classifyByKeywords('My schedule is full this month.')).not.toBe('MEETING_REQUEST')
  })

  it('returns null when nothing is clear', () => {
    expect(classifyByKeywords('Merci, je transmets à mon collègue.')).toBeNull()
  })
})
