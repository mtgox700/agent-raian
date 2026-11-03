/**
 * Tool-use loop for agents (the Analyst, E3), separate from client.ts:
 * these calls run on the current reasoning models, which refuse
 * `temperature`, forced `tool_choice` and assistant prefill.
 *
 * The model sits behind AgentModel so the loop is tested with a scripted
 * model (no network, no cost) and the sandbox can run without a key.
 *
 *   runAgentLoop  model ⇄ tools until the model ends its turn, at most
 *                 maxSteps calls; every call's usage is returned.
 *   anthropicModel the real thing: adaptive thinking, effort, strict tools,
 *                 system prompt and tool definitions cached.
 */

import Anthropic from '@anthropic-ai/sdk'
import { LLM_TIMEOUT_MS } from './client'

export type Effort = 'low' | 'medium' | 'high'

export interface AgentTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ModelRequest {
  system: string
  messages: Anthropic.MessageParam[]
  tools?: AgentTool[]
  effort: Effort
  maxTokens: number
}

export interface TurnUsage {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface ModelTurn {
  content: Anthropic.ContentBlock[]
  stopReason: Anthropic.StopReason | null
  usage: TurnUsage
}

export interface AgentModel {
  readonly name: string
  create(req: ModelRequest): Promise<ModelTurn>
}

export type AgentStop = 'end_turn' | 'refusal' | 'max_tokens' | 'max_steps'

export interface AgentRun {
  text: string
  stop: AgentStop
  messages: Anthropic.MessageParam[]
  usage: TurnUsage[]
}

export interface LoopOptions {
  model: AgentModel
  system: string
  messages: Anthropic.MessageParam[]
  tools?: AgentTool[]
  effort?: Effort
  maxTokens?: number
  maxSteps?: number
  /** Runs one tool call; the string goes back to the model as the result. */
  execute?: (name: string, input: unknown) => Promise<{ content: string; isError: boolean }>
  onToolCall?: (name: string, input: unknown) => void
  /** Each call's usage, as soon as it is known: a later failure loses none. */
  onUsage?: (usage: TurnUsage) => void
}

export const DEFAULT_MAX_STEPS = 8

export function textOf(content: Anthropic.ContentBlock[]): string {
  return content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()
}

export async function runAgentLoop(opts: LoopOptions): Promise<AgentRun> {
  const messages = [...opts.messages]
  const usage: TurnUsage[] = []
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS

  for (let step = 0; step < maxSteps; step++) {
    const turn = await opts.model.create({
      system: opts.system, messages, tools: opts.tools,
      effort: opts.effort ?? 'medium', maxTokens: opts.maxTokens ?? 8_000,
    })
    usage.push(turn.usage)
    opts.onUsage?.(turn.usage)
    // Thinking blocks go back unchanged with the tool results.
    messages.push({ role: 'assistant', content: turn.content as Anthropic.ContentBlockParam[] })

    if (turn.stopReason === 'refusal') return { text: '', stop: 'refusal', messages, usage }
    if (turn.stopReason === 'max_tokens') return { text: textOf(turn.content), stop: 'max_tokens', messages, usage }
    if (turn.stopReason === 'pause_turn') continue

    const calls = turn.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (turn.stopReason !== 'tool_use' || calls.length === 0) {
      return { text: textOf(turn.content), stop: 'end_turn', messages, usage }
    }
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) {
      opts.onToolCall?.(call.name, call.input)
      const out = opts.execute
        ? await opts.execute(call.name, call.input).catch(() => ({ content: 'Erreur interne de l’outil.', isError: true }))
        : { content: 'Aucun outil disponible.', isError: true }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: out.content, is_error: out.isError })
    }
    messages.push({ role: 'user', content: results })
  }
  return { text: '', stop: 'max_steps', messages, usage }
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

export function anthropicModel(model: string, apiKey = process.env.ANTHROPIC_API_KEY): AgentModel {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  const client = new Anthropic({ apiKey, timeout: LLM_TIMEOUT_MS, maxRetries: 2 })
  return {
    name: model,
    async create(req) {
      const tools = req.tools?.map((t, i, all): Anthropic.Tool => ({
        name: t.name, description: t.description, strict: true,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
        // The stable prefix (tools, then system) is cached once per conversation.
        ...(i === all.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }))
      const res = await client.messages.create({
        model,
        max_tokens: req.maxTokens,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: req.messages,
        ...(tools?.length ? { tools } : {}),
        thinking: { type: 'adaptive' },
        output_config: { effort: req.effort },
      })
      return {
        content: res.content,
        stopReason: res.stop_reason,
        usage: {
          model: res.model,
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
          cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
        },
      }
    },
  }
}

// ─── Cost ───────────────────────────────────────────────────────────────────

/** US dollars per million tokens (verified 2026-10-18). Cache write = 1.25 × input. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5':   { input: 4,    output: 20,  cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2,    output: 10,  cacheRead: 0.2 },
  'claude-haiku-5-5':  { input: 0.1,  output: 0.5, cacheRead: 0.01 },
}

/** Estimated cost in micro-dollars; an unknown model is priced as the dearest. */
export function costMicroUsd(u: TurnUsage): number {
  const p = PRICES[Object.keys(PRICES).find((k) => u.model.startsWith(k)) ?? 'claude-opus-5-5']
  const dollars = (u.inputTokens * p.input + u.cacheWriteTokens * p.input * 1.25 + u.cacheReadTokens * p.cacheRead + u.outputTokens * p.output) / 1_000_000
  return Math.round(dollars * 1_000_000)
}
