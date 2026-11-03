/**
 * Keyword rules for inbound replies (French and English), used:
 *  - before the LLM, to recognise automatic replies (out of office, holidays),
 *    which must not stop a sequence nor count as an answer;
 *  - after an LLM failure, so a hot reply is still recognised instead of
 *    silently becoming NEUTRAL.
 */

import type { ReplyCategory } from './reply-classifier'

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'")
}

// Anchored at the start of the subject: automatic replies prefix the original
// subject ("Réponse automatique : …"). A campaign about "gestion des absences"
// or a human "Re: votre question sur l'absence…" must not match.
const AUTO_REPLY_SUBJECT = /^(reponse automatique|automatic reply|auto(matic)?[- ]?reply|out of (the )?office|absence du bureau|absent du bureau|absence\s*(:|$)|auto:)/
const AUTO_REPLY_BODY = [
  /je suis (actuellement )?absente? (du bureau|jusqu)/,
  /je suis (actuellement )?en conges/,
  /i am (currently )?out of (the )?office/,
  /i'?m (currently )?out of (the )?office/,
  /with (limited|no) access to (my )?email/,
  /this is an automatic(ally generated)? (reply|message)/,
  /ceci est (une reponse|un message) automatique/,
]

/** True for out-of-office and other automatic responses. */
export function isAutoReply(subject: string, body: string): boolean {
  const s = normalize(subject).trim()
  if (AUTO_REPLY_SUBJECT.test(s)) return true
  const b = normalize(body)
  return AUTO_REPLY_BODY.some((re) => re.test(b))
}

const RULES: Array<[ReplyCategory, RegExp]> = [
  ['NOT_INTERESTED', /(\bstop\b|desabonn|desinscri|unsubscribe|remove me|ne (plus|pas) me (re)?contacter|retirez[- ]moi)/],
  ['NEGATIVE', /(pas interess|not interested|no thanks|non merci|pas pour (le moment|nous)|pas le bon moment|not a good time|already (have|use))/],
  ['MEETING_REQUEST', /(rendez[- ]vous|\brdv\b|creneau|(un|petit|court) appel|(a|un|quick|short) call\b|\bdemo\b|calendly|reunion|disponible (le|jeudi|lundi|mardi|mercredi|vendredi|demain)|book a (call|meeting)|schedule a (call|meeting|demo))/],
  ['POSITIVE', /(interesse|interested|en savoir plus|tell me more|sounds (good|interesting)|plus d'infos|envoyez[- ]moi)/],
]

/** Best-effort category from keywords; null when nothing is clear. */
export function classifyByKeywords(body: string): ReplyCategory | null {
  const b = normalize(body)
  for (const [category, re] of RULES) {
    if (re.test(b)) return category
  }
  return null
}
