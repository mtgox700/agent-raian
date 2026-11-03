/**
 * One question to the Analyst, end to end:
 *
 *   orchestrator ⇄ tools ─▶ draft ─▶ devil's advocate ─▶ verifier
 *                                         └─ objections or faults: one revision
 *                                                         └─ still faulty: refused
 *
 * An answer is delivered only once the deterministic verifier passes: the
 * draft is never streamed, only the progress of the work is.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { runAgentLoop, textOf, type AgentModel, type TurnUsage } from '@/lib/llm/agent'
import { delimitUntrusted } from '@/lib/security/prompt-guard'
import { DEVIL_PROMPT, ORCHESTRATOR_PROMPT, revisionRequest } from './prompts'
import { TOOL_DEFINITIONS, ToolSession, type ToolContext, type ToolResult } from './tools'
import { verifyAnswer, type Fault } from './verify'
import { humanPunctuation } from '@/lib/text/human-punctuation'

export type AnalystStatus = 'ok' | 'refused' | 'error'
export type AnalystTask = 'analyst.orchestrator' | 'analyst.devil' | 'analyst.revision'

export interface Objection { type: string; affirmation: string; action: string; explication: string }

export type AnalystEvent =
  | { type: 'step'; step: 'analyse' | 'relecture' | 'verification' | 'correction' }
  | { type: 'tool'; name: string }

export interface AnalystModels { orchestrator: AgentModel; devil: AgentModel }

export interface AnalystInput {
  question: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ctx: ToolContext
  models: AnalystModels
  onEvent?: (e: AnalystEvent) => void
  /** Receives every model call's usage as it happens, so a crash loses none. */
  usageSink?: Array<TurnUsage & { task: AnalystTask }>
}

export interface AnalystAnswer {
  status: AnalystStatus
  text: string
  /** Tool results the final answer cites. */
  evidence: ToolResult[]
  usage: Array<TurnUsage & { task: AnalystTask }>
  objections: Objection[]
  faults: Fault[]
  devil: 'ok' | 'illisible' | 'ignore'
  revised: boolean
}

export const MESSAGES = {
  unverified: 'Je préfère ne pas répondre : je n’ai pas pu vérifier chaque chiffre de ma réponse dans vos données. Reformulez la question, ou posez-la sur une seule campagne.',
  refusal: 'Je ne peux pas répondre à cette demande. Je peux expliquer pourquoi une campagne avance ou stagne, comparer des campagnes, ou dire quoi changer cette semaine.',
  error: 'L’analyse n’a pas abouti. Réessayez dans un instant ; si cela persiste, posez une question plus ciblée.',
} as const

const MAX_HISTORY_TURNS = 6
export const MAX_QUESTION_CHARS = 2_000
const DEVIL_INPUT_CHARS = 60_000

/** When the devil's verdict cannot be read twice, the safe objection: no cause asserted. */
const DEVIL_FALLBACK: Objection = {
  type: 'relecture_indisponible', affirmation: 'toute conclusion causale ou comparative',
  action: 'retrograder', explication: 'La relecture critique n’a pas pu être lue : ne présente aucune cause ni aucun classement comme démontré.',
}

/** The devil's verdict; anything unparsable is reported, never trusted. */
export function parseObjections(text: string): Objection[] | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { objections?: unknown }
    if (!Array.isArray(parsed.objections)) return null
    return parsed.objections
      .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
      .map((o) => ({ type: String(o.type ?? ''), affirmation: String(o.affirmation ?? ''), action: String(o.action ?? ''), explication: String(o.explication ?? '') }))
      .slice(0, 8)
  } catch {
    return null
  }
}

function citedRefs(text: string): Set<string> {
  return new Set([...text.matchAll(/\[(T\d+)\]/g)].map((m) => m[1]))
}

export async function runAnalyst(input: AnalystInput): Promise<AnalystAnswer> {
  const session = new ToolSession(input.ctx)
  const emit = input.onEvent ?? (() => {})
  const usage: AnalystAnswer['usage'] = input.usageSink ?? []
  const sink = (task: AnalystTask) => (u: TurnUsage) => { usage.push({ ...u, task }) }
  const base = { evidence: [], objections: [], faults: [], devil: 'ignore' as const, revised: false }

  const history: Anthropic.MessageParam[] = (input.history ?? []).slice(-MAX_HISTORY_TURNS * 2).map((m) => ({ role: m.role, content: m.content }))
  const tools = TOOL_DEFINITIONS.map((t) => ({ ...t, input_schema: t.input_schema as Record<string, unknown> }))
  const execute = async (name: string, args: unknown) => {
    const r = await session.call(name, args)
    return { content: JSON.stringify({ ref: r.ref, ...(r.data as object) }), isError: !r.ok }
  }
  const onToolCall = (name: string) => emit({ type: 'tool', name })

  emit({ type: 'step', step: 'analyse' })
  const first = await runAgentLoop({
    model: input.models.orchestrator, system: ORCHESTRATOR_PROMPT, tools, execute, onToolCall,
    messages: [...history, { role: 'user', content: input.question.slice(0, MAX_QUESTION_CHARS) }],
    onUsage: sink('analyst.orchestrator'),
  })
  if (first.stop === 'refusal') return { ...base, status: 'refused', text: MESSAGES.refusal, usage }
  if (first.stop !== 'end_turn' || !first.text) return { ...base, status: 'error', text: MESSAGES.error, usage }
  // No data consulted, nothing to prove: whatever the draft says, the
  // answer is the scope refusal (an out-of-scope question, or a model that
  // skipped the tools). Never an unsourced claim delivered as "ok".
  if (session.results.length === 0) return { ...base, status: 'refused', text: MESSAGES.refusal, usage }

  // Devil's advocate: the draft and the tool results, never the user's words.
  // Both are data to her: the draft may echo injected text, the results
  // carry campaign names and job titles.
  emit({ type: 'step', step: 'relecture' })
  const evidence = `BROUILLON :\n${delimitUntrusted(first.text)}\n\nRÉSULTATS D’OUTILS :\n${delimitUntrusted(JSON.stringify(session.results), DEVIL_INPUT_CHARS)}`
  let parsed: Objection[] | null = null
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const turn = await input.models.devil.create({ system: DEVIL_PROMPT, effort: 'high', maxTokens: 8_000, messages: [{ role: 'user', content: evidence }] })
    usage.push({ ...turn.usage, task: 'analyst.devil' })
    parsed = turn.stopReason === 'end_turn' ? parseObjections(textOf(turn.content)) : null
  }
  // Unreadable twice: fail safe, the draft is revised as if contested.
  const devil: AnalystAnswer['devil'] = parsed ? 'ok' : 'illisible'
  const objections: Objection[] = parsed ?? [DEVIL_FALLBACK]

  emit({ type: 'step', step: 'verification' })
  let text = first.text
  let check = verifyAnswer(text, session.results)
  let revised = false

  if (objections.length > 0 || !check.ok) {
    emit({ type: 'step', step: 'correction' })
    revised = true
    const ask = revisionRequest(
      objections.map((o) => `- [${o.type}] « ${o.affirmation} » : ${o.action} (${o.explication})`).join('\n'),
      check.faults.map((f) => `- ${f.kind} : ${f.detail}`).join('\n'),
    )
    const second = await runAgentLoop({
      model: input.models.orchestrator, system: ORCHESTRATOR_PROMPT, tools, execute, onToolCall, maxSteps: 4,
      messages: [...first.messages, { role: 'user', content: ask }],
      onUsage: sink('analyst.revision'),
    })
    if (second.stop !== 'end_turn' || !second.text) return { ...base, status: 'error', text: MESSAGES.error, usage, objections, devil, revised }
    text = second.text
    check = verifyAnswer(text, session.results)
  }

  if (!check.ok) return { ...base, status: 'refused', text: MESSAGES.unverified, usage, objections, faults: check.faults, devil, revised }
  const refs = citedRefs(text)
  // After the verifier: the cleaning changes punctuation, never a number nor a citation.
  return { status: 'ok', text: humanPunctuation(text), evidence: session.results.filter((r) => refs.has(r.ref)), usage, objections, faults: [], devil, revised }
}
