/**
 * Measurable features of a sequence step: no judgement. Whether "long" is
 * bad is decided later by diagnose(), with a threshold and its evidence;
 * here, only what can be counted on the template the customer wrote.
 */

export interface StepTemplate {
  position: number
  dayOffset: number
  channel: string
  subject: string
  body: string
}

export interface MessageFeatures {
  position: number
  channel: string
  dayOffset: number
  /** Days since the previous step (0 for the first). */
  gapDays: number
  words: number
  characters: number
  questions: number
  links: number
  /** {{firstName}}, {{company}}… used in the subject or the body. */
  personalisation: string[]
  subjectWords: number
  subjectQuestion: boolean
  subjectPersonalised: boolean
}

const VARIABLE = /\{\{\s*(\w+)\s*\}\}/g
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi

function words(text: string): number {
  const cleaned = text.replace(VARIABLE, 'x').trim()
  return cleaned ? cleaned.split(/\s+/).length : 0
}

function variables(text: string): string[] {
  return [...text.matchAll(VARIABLE)].map((m) => m[1])
}

export function messageFeatures(steps: StepTemplate[]): MessageFeatures[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position)
  return ordered.map((step, i) => ({
    position:            step.position,
    channel:             step.channel,
    dayOffset:           step.dayOffset,
    gapDays:             i === 0 ? 0 : step.dayOffset - ordered[i - 1].dayOffset,
    words:               words(step.body),
    characters:          step.body.length,
    questions:           (step.body.match(/\?/g) ?? []).length,
    links:               (step.body.match(LINK) ?? []).length,
    personalisation:     [...new Set([...variables(step.subject), ...variables(step.body)])].sort(),
    subjectWords:        words(step.subject),
    subjectQuestion:     step.subject.includes('?'),
    subjectPersonalised: variables(step.subject).length > 0,
  }))
}
