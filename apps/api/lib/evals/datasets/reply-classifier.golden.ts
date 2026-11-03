/**
 * Golden dataset for the reply-classifier agent (FR + EN).
 *
 * Each case is a real-world style reply with its human-labeled category.
 * Used by lib/agents/reply-classifier.eval.test.ts to measure accuracy/F1
 * whenever OLLAMA_API_KEY is present (CI). Grow this set from production
 * traces: never shrink it without justification.
 */

import type { ReplyCategory } from '@/lib/agents/reply-classifier'

export interface ReplyGoldenCase {
  id: string
  subject: string
  body: string
  expected: ReplyCategory
}

export const REPLY_GOLDEN: ReplyGoldenCase[] = [
  // POSITIVE
  { id: 'pos-fr-1', subject: 'Re: prospection', body: 'Bonjour, oui ça m’intéresse, pouvez-vous m’envoyer plus d’informations ?', expected: 'POSITIVE' },
  { id: 'pos-en-1', subject: 'Re: quick question', body: 'Sounds interesting, tell me more about how it works.', expected: 'POSITIVE' },
  { id: 'pos-en-2', subject: 'Re: outreach', body: 'Yeah this could be relevant for us. What does pricing look like?', expected: 'POSITIVE' },

  // MEETING_REQUEST
  { id: 'meet-fr-1', subject: 'Re: démo', body: 'Ok, on peut prévoir un rendez-vous la semaine prochaine ? Je suis dispo mardi.', expected: 'MEETING_REQUEST' },
  { id: 'meet-en-1', subject: 'Re: intro', body: 'Happy to jump on a quick call. Can you send a calendar link?', expected: 'MEETING_REQUEST' },

  // NEGATIVE
  { id: 'neg-fr-1', subject: 'Re: offre', body: 'Merci mais ce n’est pas le bon moment pour nous, on a déjà un prestataire.', expected: 'NEGATIVE' },
  { id: 'neg-en-1', subject: 'Re: outreach', body: 'Not interested, we already use a competitor.', expected: 'NEGATIVE' },

  // NOT_INTERESTED (unsubscribe)
  { id: 'unsub-fr-1', subject: 'Re:', body: 'Merci de me désabonner et de ne plus me contacter.', expected: 'NOT_INTERESTED' },
  { id: 'unsub-en-1', subject: 'Re:', body: 'Please remove me from your list. Stop emailing me.', expected: 'NOT_INTERESTED' },

  // NEUTRAL (OOO / automated / unclear)
  { id: 'neutral-ooo-fr', subject: 'Absence du bureau', body: 'Je suis actuellement en congés jusqu’au 15 et reviendrai vers vous à mon retour.', expected: 'NEUTRAL' },
  { id: 'neutral-ooo-en', subject: 'Out of Office', body: 'I am out of office until Monday with limited access to email.', expected: 'NEUTRAL' },
  { id: 'neutral-unclear', subject: 'Re:', body: 'Who is this?', expected: 'NEUTRAL' },
]
