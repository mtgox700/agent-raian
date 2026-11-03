/**
 * Drafts the WhatsApp or SMS message the user sends from their own phone.
 *
 * Short, personal, one question, sender identified. SMS always ends with an
 * opt-out ("STOP"). Replies reach the user's phone, not Phantera: the user
 * marks the lead "Ne plus contacter", which blocks every channel.
 */

import { chat, isLlmConfigured } from '@/lib/llm/client'
import { SMS_OPT_OUT, TOUCH_MAX_LENGTH, type TouchChannel } from '@/lib/touch/channels'
import { cleanDraft, finalizeDraft } from '@/lib/touch/finalize'
import { UNTRUSTED_NOTICE, delimitUntrusted, untrustedLine } from '@/lib/security/prompt-guard'

export { SMS_OPT_OUT, TOUCH_MAX_LENGTH, cleanDraft, finalizeDraft, type TouchChannel }

export interface TouchDraftInput {
  channel: TouchChannel
  lead: { firstName: string; company: string | null; title: string | null }
  sender: { fullName: string; company: string }
  /** What the user sells, from the campaign (never invented). */
  offer: string | null
  /** Subject of the email already sent, to refer to it. */
  previousSubject: string | null
}

const SYSTEM = `Tu rédiges un message court qu'un dirigeant envoie lui-même, depuis son téléphone, à un prospect B2B en France.
Règles :
- Français, vouvoiement, ton humain et direct, aucune formule marketing, aucun emoji, aucun lien.
- Présente l'expéditeur (prénom + société) dans la première phrase.
- Si un e-mail a déjà été envoyé, fais-y référence en une demi-phrase.
- Une seule question fermée à la fin (ex. « Est-ce un sujet pour vous en ce moment ? »).
- N'invente rien sur l'offre : n'utilise que le texte de l'offre fourni. S'il est absent, reste général.
- Réponds uniquement avec le message, sans guillemets ni commentaire.`

function fallbackDraft(input: TouchDraftInput): string {
  const { lead, sender, previousSubject } = input
  const intro = `Bonjour ${lead.firstName}, ${sender.fullName}${sender.company ? ` de ${sender.company}` : ''}.`
  const ref = previousSubject ? ` Je vous ai écrit par e-mail au sujet de « ${previousSubject} ».` : ''
  return `${intro}${ref} Est-ce un sujet pour vous en ce moment ?`
}

export async function draftTouchMessage(input: TouchDraftInput): Promise<string> {
  if (!isLlmConfigured()) return finalizeDraft(input.channel, fallbackDraft(input))

  const prompt = [
    `Canal : ${input.channel === 'SMS' ? 'SMS (300 caractères maximum, mention STOP ajoutée ensuite)' : 'WhatsApp (4 phrases maximum)'}`,
    `Expéditeur : ${input.sender.fullName}${input.sender.company ? `, ${input.sender.company}` : ''}`,
    UNTRUSTED_NOTICE,
    `Prospect : ${delimitUntrusted([untrustedLine(input.lead.firstName, 60), untrustedLine(input.lead.title), untrustedLine(input.lead.company)].filter(Boolean).join(', '))}`,
    `Offre : ${untrustedLine(input.offer, 600) || '(non précisée)'}`,
    `E-mail déjà envoyé : ${untrustedLine(input.previousSubject) || '(aucun)'}`,
  ].join('\n')

  try {
    const text = cleanDraft(await chat({ system: SYSTEM, prompt, task: 'copy', maxTokens: 300, temperature: 0.6 }))
    return finalizeDraft(input.channel, text || fallbackDraft(input))
  } catch (err) {
    console.error('[touch/draft] LLM failed, using template:', err instanceof Error ? err.message : String(err))
    return finalizeDraft(input.channel, fallbackDraft(input))
  }
}
