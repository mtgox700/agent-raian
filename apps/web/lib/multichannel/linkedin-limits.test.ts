import { describe, it, expect } from 'vitest'
import {
  LINKEDIN_LIMITS,
  INVITE_NOTE_TARGET_MAX,
  estimateRenderedLength,
  inviteNoteFits,
  fitText,
  fitInviteNote,
} from './linkedin-limits'

describe('LINKEDIN_LIMITS', () => {
  it('encodes the verified platform caps', () => {
    // Verified September 2026: 300 on every plan, free and Premium alike.
    expect(LINKEDIN_LIMITS.INVITE_NOTE_MAX).toBe(300)
    expect(LINKEDIN_LIMITS.DM_MAX).toBe(8000)
  })

  it('leaves headroom between the generation ceiling and the hard cap', () => {
    expect(INVITE_NOTE_TARGET_MAX).toBeLessThan(LINKEDIN_LIMITS.INVITE_NOTE_MAX)
  })
})

describe('estimateRenderedLength', () => {
  it('returns the raw length when there is no variable', () => {
    expect(estimateRenderedLength('Bonjour')).toBe(7)
  })

  it('costs a variable at its substituted size, not its token size', () => {
    // '{{firstName}}' is 13 chars in the template but budgeted at 12 rendered.
    expect(estimateRenderedLength('{{firstName}}')).toBe(12)
  })

  it('accounts for every occurrence', () => {
    const one = estimateRenderedLength('x {{company}}')
    const two = estimateRenderedLength('x {{company}} {{company}}')
    expect(two - one).toBeGreaterThan(0)
  })

  it('never returns a negative length', () => {
    expect(estimateRenderedLength('{{firstName}}')).toBeGreaterThan(0)
  })
})

describe('inviteNoteFits', () => {
  it('accepts a short note', () => {
    expect(inviteNoteFits('{{firstName}}, on travaille tous les deux sur la prospection B2B.')).toBe(true)
  })

  it('rejects a template that only overflows once rendered', () => {
    // 295 raw chars + a variable that expands past the 300 cap.
    const note = 'a'.repeat(295) + '{{firstName}}'
    expect(note.length).toBeGreaterThan(300)
    expect(inviteNoteFits(note)).toBe(false)
  })

  it('rejects anything above the hard cap', () => {
    expect(inviteNoteFits('a'.repeat(301))).toBe(false)
  })
})

describe('fitText', () => {
  it('leaves a short text untouched', () => {
    expect(fitText('Bonjour', 300)).toBe('Bonjour')
  })

  it('never exceeds the maximum', () => {
    const long = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. '.repeat(10)
    expect(fitText(long, 300).length).toBeLessThanOrEqual(300)
  })

  it('never splits a word in half', () => {
    // The regression: slice(0, 275) produced a dangling "No".
    const text = 'Nous avons construit une association nationale pour aider les dirigeants a avancer collectivement avec des financements publics existants qui couvrent une bonne partie des couts engages par les entreprises francaises. Nous organisons des rencontres regionales chaque mois. Nous serions ravis de vous compter parmi nous.'
    const fitted = fitText(text, 300)
    expect(fitted.length).toBeLessThanOrEqual(300)
    // Whatever we keep must end on a complete word or an ellipsis.
    expect(/[.!?…]$/.test(fitted)).toBe(true)
    // And every kept word must exist verbatim in the source.
    const words = fitted.replace(/…$/, '').trim().split(/\s+/)
    for (const w of words) expect(text).toContain(w)
  })

  it('prefers cutting on a sentence boundary', () => {
    const text = 'Première phrase courte. Deuxième phrase qui déborde largement au-delà de la limite imposée par la plateforme.'
    const fitted = fitText(text, 40)
    expect(fitted).toBe('Première phrase courte.')
  })

  it('falls back to a word boundary with an ellipsis when no sentence fits', () => {
    const text = 'un texte continu sans aucune ponctuation finale qui depasse la limite fixee'
    const fitted = fitText(text, 30)
    expect(fitted.endsWith('…')).toBe(true)
    expect(fitted.length).toBeLessThanOrEqual(30)
    expect(fitted).not.toContain('  ')
  })

  it('does not leave dangling punctuation before the ellipsis', () => {
    const fitted = fitText('alpha beta, gamma delta epsilon zeta eta theta', 16)
    expect(fitted).not.toMatch(/[,;:]…$/)
  })
})

describe('fitInviteNote', () => {
  it('clamps to the LinkedIn invitation cap', () => {
    const long = 'phrase de remplissage assez longue pour deborder. '.repeat(20)
    expect(fitInviteNote(long).length).toBeLessThanOrEqual(LINKEDIN_LIMITS.INVITE_NOTE_MAX)
  })

  it('is a no-op on a compliant note', () => {
    const note = '{{firstName}}, je suis vos publications sur la transformation IA du secteur industriel.'
    expect(fitInviteNote(note)).toBe(note)
  })
})
