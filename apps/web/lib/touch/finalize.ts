/**
 * Fits a WhatsApp/SMS message to its channel. No LLM here: used both for
 * drafts and for sequence steps rendered at send time.
 */

import { SMS_OPT_OUT, TOUCH_MAX_LENGTH, type TouchChannel } from '@/lib/touch/channels'

/** Removes wrapping quotes and blank lines the model may add, and links it must not add. */
export function cleanDraft(text: string): string {
  return text
    .trim()
    .replace(/^["«»“”']+|["«»“”']+$/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Fits the message to the channel; SMS keeps room for the opt-out line. */
export function finalizeDraft(channel: TouchChannel, text: string): string {
  const max = TOUCH_MAX_LENGTH[channel]
  if (channel === 'SMS') {
    const room = max - SMS_OPT_OUT.length - 1
    const body = text.replace(SMS_OPT_OUT, '').trim()
    const cut = body.length > room ? `${body.slice(0, room - 1).replace(/\s+\S*$/, '')}…` : body
    return `${cut} ${SMS_OPT_OUT}`
  }
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text
}
