/**
 * Phantera: LinkedIn hard limits and safe text fitting.
 *
 * SINGLE SOURCE OF TRUTH. Never hardcode a LinkedIn character cap anywhere
 * else: import from here so a platform change is a one-line fix.
 *
 * ── Verified limits (September 2026, multiple concordant sources) ───────────
 *  Invitation note (not connected) : 300 chars: SAME on every plan
 *                                    (free, Premium, Sales Navigator).
 *  Direct message (1st degree)     : 8 000 chars.
 *  InMail body / subject           : 1 900 / 200 chars (unused by Phantera).
 *  Group message                   : 2 000 chars (unused by Phantera).
 *
 * The 300-char cap counts EVERYTHING: spaces, line breaks, punctuation, emoji.
 *
 * ── Product insight, not just a technical cap ───────────────────────────────
 * Notes of 120-180 chars measurably outperform notes that fill the full 300.
 * An invitation note is NOT a pitch: its only job is to earn the "Accept".
 * So we deliberately target well under the ceiling (see TARGET_* below).
 *
 * ── Why the generation ceiling is lower than the hard cap ───────────────────
 * Step bodies are TEMPLATES ({{firstName}}, {{company}}…) rendered at SEND
 * time. A 295-char template becomes 310 chars once "Jean-Christophe" lands in
 * it. We therefore generate under INVITE_NOTE_TARGET_MAX and keep
 * SUBSTITUTION_HEADROOM chars of slack for the rendered result.
 */

export const LINKEDIN_LIMITS = {
  /** Hard platform cap for a connection-request note. Identical on all plans. */
  INVITE_NOTE_MAX: 300,
  /** Hard platform cap for a DM to a 1st-degree connection. */
  DM_MAX: 8000,
  /** InMail caps: documented for completeness; Phantera does not send InMails. */
  INMAIL_BODY_MAX: 1900,
  INMAIL_SUBJECT_MAX: 200,
} as const

/**
 * Slack reserved for {{variable}} substitution between the stored template and
 * the rendered text. 40 chars covers a long first name + a long company name.
 */
export const SUBSTITUTION_HEADROOM = 40

/** Generation window for an invitation note (on the TEMPLATE, before render). */
export const INVITE_NOTE_TARGET_MIN = 120
export const INVITE_NOTE_TARGET_MAX =
  LINKEDIN_LIMITS.INVITE_NOTE_MAX - SUBSTITUTION_HEADROOM // 260

/**
 * Worst-case rendered length of a template, used to validate BEFORE the lead is
 * known. Each variable is costed at a generous P90 value rather than its raw
 * token length, so a template that passes here fits for virtually every lead.
 */
const VARIABLE_COST: Record<string, number> = {
  firstName: 12,
  lastName: 14,
  company: 20,
  title: 26,
  industry: 18,
}

/** Estimate the rendered length of a template containing {{variables}}. */
export function estimateRenderedLength(template: string): number {
  let length = template.length
  for (const [name, cost] of Object.entries(VARIABLE_COST)) {
    const token = `{{${name}}}`
    const occurrences = template.split(token).length - 1
    if (occurrences > 0) length += occurrences * (cost - token.length)
  }
  return Math.max(0, length)
}

/** True when a template will still fit the invitation note cap once rendered. */
export function inviteNoteFits(template: string): boolean {
  return estimateRenderedLength(template) <= LINKEDIN_LIMITS.INVITE_NOTE_MAX
}

/**
 * Cut `text` to `max` chars WITHOUT ever splitting a word.
 *
 * This replaces the previous `text.slice(0, 275)`, which truncated mid-word and
 * shipped invitations ending on a dangling "No" (founder report, 2026-09-03).
 *
 * Strategy, in order of preference:
 *   1. It already fits          -> return untouched.
 *   2. A sentence ends late enough in the window -> cut there. Cleanest result:
 *      the note reads as if it was written that length on purpose.
 *   3. Otherwise                -> cut at the last whole word and append "…" so
 *      the reader can tell the thought continues.
 *
 * Never returns more than `max` characters, ellipsis included.
 */
export function fitText(text: string, max: number): string {
  const clean = text.trim()
  if (clean.length <= max) return clean

  const window = clean.slice(0, max)

  // 2. Prefer the last sentence boundary, but only if it keeps enough of the
  //    message. Below half the budget we would amputate the substance, so fall
  //    through. Half is deliberate rather than strict: on the 300-char note cap
  //    it keeps any sentence ending past 150 chars, which lands squarely in the
  //    120-180 range that converts best. A clean short sentence beats a longer
  //    one trailing an ellipsis.
  const lastSentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('.\n'),
    window.lastIndexOf('!\n'),
    window.lastIndexOf('?\n'),
    // A sentence ending exactly at the cut has no trailing separator.
    /[.!?]$/.test(window) ? window.length - 1 : -1,
  )
  if (lastSentence >= Math.floor(max * 0.5)) {
    return window.slice(0, lastSentence + 1).trim()
  }

  // 3. Last whole word + ellipsis, keeping the total under `max`.
  const room = window.slice(0, max - 1)
  const lastSpace = room.lastIndexOf(' ')
  const body = lastSpace > 0 ? room.slice(0, lastSpace) : room
  return `${body.replace(/[,;:\-–\s]+$/, '')}…`
}

/** Fit a note to LinkedIn's invitation cap. Use at the very last moment. */
export function fitInviteNote(note: string): string {
  return fitText(note, LINKEDIN_LIMITS.INVITE_NOTE_MAX)
}
