/**
 * Punctuation a person types. The em dash and the en dash used as an aside,
 * and arrows in running text, are the first signs readers take for a text
 * written by an AI. Applied to everything a model writes that a person reads:
 * outreach messages (lib/agents/copywriter) and the Analyst's answers.
 *
 * A dash between two numbers stays a range ("10-20"), a dash opening a line
 * stays a list item ("- "), every other one becomes a comma.
 */

// Built from code points: the characters themselves must not appear in the source.
const EM = String.fromCharCode(0x2014)
const EN = String.fromCharCode(0x2013)
const DASH = `[${EM}${EN}]`
const RANGE = new RegExp(`(\\d)\\s*${DASH}\\s*(\\d)`, 'g')
const BULLET = new RegExp(`^([ \\t]*)${DASH}[ \\t]+`, 'gm')
const ASIDE = new RegExp(`[ \\t]*${DASH}[ \\t]*`, 'g')
const ARROW = new RegExp(`[ \\t]*[${String.fromCharCode(0x2192)}${String.fromCharCode(0x21d2)}][ \\t]*`, 'g')

export function humanPunctuation(text: string): string {
  return text
    .replace(RANGE, '$1-$2')
    .replace(BULLET, '$1- ')
    .replace(ARROW, ' : ')
    .replace(ASIDE, ', ')
    // What the replacements may leave: ", ,", " ,", a comma before the end
    // of a line or of the text.
    .replace(/,(\s*,)+/g, ',')
    .replace(/[ \t]+,/g, ',')
    .replace(/,[ \t]*$/gm, '')
    .trim()
}
