/**
 * Phantera: Unified LLM client (Anthropic primary, Ollama fallback)
 *
 * Single entry point for every LLM call (scoring, copywriting, reply
 * classification). Routes to the Anthropic Claude SDK when ANTHROPIC_API_KEY
 * is set; falls back to Ollama's OpenAI-compatible /chat/completions endpoint
 * otherwise (kept intact for hermetic local dev / FOSS self-hosting).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Provider selection priority:
 *   1. ANTHROPIC_API_KEY -> Claude SDK  (production default)
 *   2. OLLAMA_API_KEY    -> Ollama Cloud (fallback)
 *   3. Neither           -> agents fall back to deterministic mocks
 *
 * Per-task model routing (Anthropic):
 *   classify -> claude-haiku-4-5-20251001   fast/cheap reply classification
 *   score    -> claude-haiku-4-5-20251001   structured lead scoring
 *   copy     -> claude-sonnet-4-6           nuanced email copywriting
 *
 * Per-task model routing (Ollama, when fallback active):
 *   OLLAMA_MODEL_CLASSIFY / OLLAMA_MODEL_SCORE / OLLAMA_MODEL_COPY
 *   (falls back to OLLAMA_MODEL -> 'qwen3.5')
 *
 * Optional global overrides:
 *   ANTHROPIC_MODEL    Claude model override (applies to all tasks)
 *   OLLAMA_MODEL       Ollama model override (fallback path)
 *
 * Agents treat isLlmConfigured() as the "real model available" signal so
 * offline test/dev runs deterministically use agent mocks: tests stay
 * hermetic and don't burn API credits.
 *
 * Prompt caching: when using Anthropic, system prompts are sent with
 * cache_control: ephemeral. Eligible long prompts get cached for ~5 min,
 * reducing cost by up to 90% on repeated calls (huge for batch scoring
 * and reply classification where the system prompt is identical).
 * ──────────────────────────────────────────────────────────────────────────
 */

import Anthropic from '@anthropic-ai/sdk'

// ─── Constants & types ──────────────────────────────────────────────────────

const DEFAULT_OLLAMA_BASE_URL = 'https://ollama.com/v1'
const DEFAULT_OLLAMA_MODEL    = 'qwen3.5'

export type LlmTask = 'classify' | 'score' | 'copy'

const CLAUDE_MODELS: Record<LlmTask, string> = {
  classify: 'claude-haiku-4-5-20251001',
  score:    'claude-haiku-4-5-20251001',
  copy:     'claude-sonnet-4-6',
}

const TASK_ENV: Record<LlmTask, string> = {
  classify: 'OLLAMA_MODEL_CLASSIFY',
  score:    'OLLAMA_MODEL_SCORE',
  copy:     'OLLAMA_MODEL_COPY',
}

// ─── Provider detection ─────────────────────────────────────────────────────

function isAnthropicEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/**
 * Whether a real model should be called. We gate on the presence of either
 * provider key so offline test/dev runs deterministically use agent mocks.
 */
export function isLlmConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OLLAMA_API_KEY)
}

// ─── Anthropic singleton ────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

// ─── Ollama config (legacy fallback) ────────────────────────────────────────

export function llmBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '')
}

// ─── Model resolution ───────────────────────────────────────────────────────

/**
 * Resolve the model name for a task. Lets agents call `llmModel('copy')`
 * without knowing which provider is active.
 *
 *   When Anthropic is active:
 *     1. ANTHROPIC_MODEL global override (if set)
 *     2. CLAUDE_MODELS[task] (Haiku for classify/score, Sonnet for copy)
 *   When Ollama is active (fallback):
 *     1. Task-specific env override OLLAMA_MODEL_<TASK> (if set)
 *     2. OLLAMA_MODEL global override
 *     3. DEFAULT_OLLAMA_MODEL ('qwen3.5')
 *
 * CRITICAL: OLLAMA_MODEL_<TASK> env vars are NEVER applied to Anthropic
 * doing so would route Anthropic calls to Ollama model names like
 * "deepseek-v4-pro" which the Claude API doesn't know (404).
 */
export function llmModel(task?: LlmTask): string {
  if (isAnthropicEnabled()) {
    if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL
    return task ? CLAUDE_MODELS[task] : CLAUDE_MODELS.copy
  }

  // Ollama path: task-specific override allowed here.
  if (task) {
    const override = process.env[TASK_ENV[task]]
    if (override) return override
  }
  return process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL
}

// ─── Public chat API (provider-agnostic) ────────────────────────────────────

export interface ChatOptions {
  system?:      string
  prompt:       string
  /** Task hint used for default model selection when `model` is omitted. */
  task?:        LlmTask
  /** Model override; bypasses task routing. */
  model?:       string
  maxTokens?:   number
  temperature?: number
  /** Request a JSON object response. */
  json?:        boolean
  signal?:      AbortSignal
}

/** A model call that hangs must not hold a request (or an Inngest step) forever. */
export const LLM_TIMEOUT_MS = 90_000

function withTimeout(opts: ChatOptions): ChatOptions {
  return opts.signal ? opts : { ...opts, signal: AbortSignal.timeout(LLM_TIMEOUT_MS) }
}

/** Non-streaming chat completion. Returns the assistant message text. */
export async function chat(rawOpts: ChatOptions): Promise<string> {
  const opts = withTimeout(rawOpts)
  return isAnthropicEnabled() ? chatAnthropic(opts) : chatOllama(opts)
}

/**
 * Streaming chat completion: yields text deltas as they arrive. Used for the
 * copywriter's real-time UI streaming.
 */
export async function* chatStream(rawOpts: ChatOptions): AsyncGenerator<string> {
  const opts = withTimeout(rawOpts)
  if (isAnthropicEnabled()) {
    yield* chatStreamAnthropic(opts)
    return
  }
  yield* chatStreamOllama(opts)
}

// ─── Anthropic implementation ───────────────────────────────────────────────

/**
 * Build the Anthropic system block with prompt caching enabled. Eligible long
 * prompts (≥ ~1024 tokens for Haiku, larger for Sonnet) get cached for ~5 min,
 * reducing cost by up to 90% on repeated calls (e.g. batch reply classification
 * uses the same system prompt for every reply). Short prompts skip the cache
 * silently: setting `cache_control` on them is a no-op cost-wise.
 */
function buildClaudeSystem(system: string | undefined) {
  if (!system) return undefined
  return [{
    type:          'text' as const,
    text:          system,
    cache_control: { type: 'ephemeral' as const },
  }]
}

function buildClaudeUser(opts: ChatOptions): string {
  // Anthropic has no native JSON-mode toggle: we instruct the model
  // explicitly. extractJson() rescues any accidental wrapping.
  if (opts.json) {
    return `${opts.prompt}\n\nRespond with valid JSON only. No markdown code fences, no surrounding text: just the JSON object/array.`
  }
  return opts.prompt
}

/**
 * Build the messages array for Anthropic.
 *
 * NOTE: We initially used an assistant prefill (`{ role: 'assistant', content: '{' }`)
 * to force JSON-only output. Sonnet 4.6+ rejects this with a 400 error
 * ("This model does not support assistant message prefill"). We rely instead
 * on prompt instructions + extractJson() which strips markdown code fences.
 */
function buildClaudeMessages(opts: ChatOptions): Anthropic.MessageParam[] {
  return [{ role: 'user', content: buildClaudeUser(opts) }]
}

async function chatAnthropic(opts: ChatOptions): Promise<string> {
  const client = getAnthropic()
  const model  = opts.model ?? llmModel(opts.task)

  try {
    const response = await client.messages.create({
      model,
      max_tokens:  opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
      system:      buildClaudeSystem(opts.system),
      messages:    buildClaudeMessages(opts),
    }, { signal: opts.signal })

    // Claude can emit multiple content blocks (e.g. thinking + text). We
    // concatenate all text blocks defensively. extractJson() (called by
    // consumers) handles any markdown fences Claude may wrap JSON in.
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[llm:anthropic] chat failed (model=${model}):`, msg)
    throw err
  }
}

async function* chatStreamAnthropic(opts: ChatOptions): AsyncGenerator<string> {
  const client = getAnthropic()
  const model  = opts.model ?? llmModel(opts.task)
  let eventCount     = 0
  let textChunkCount = 0

  try {
    const stream = client.messages.stream({
      model,
      max_tokens:  opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
      system:      buildClaudeSystem(opts.system),
      messages:    buildClaudeMessages(opts),
    }, { signal: opts.signal })

    for await (const event of stream) {
      eventCount++

      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        textChunkCount++
        yield event.delta.text
      }
      // Note: Anthropic SDK propagates streaming errors via promise rejection
      // (caught by the outer try/catch below), NOT as a yielded event. No
      // explicit `event.type === 'error'` branch needed.
    }

    // Defensive log when the stream completes but no text chunk was yielded
    // helps diagnose the "infinite spinner" case (often: max_tokens too low for
    // JSON wrapping, or model returned only thinking blocks).
    if (textChunkCount === 0) {
      console.warn(
        `[llm:anthropic] stream finished with NO text chunks ` +
        `(events=${eventCount}, model=${model}, json=${opts.json}, maxTokens=${opts.maxTokens ?? 4096}). ` +
        `Frontend will see an empty completion.`
      )
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[llm:anthropic] stream failed (model=${model}, events=${eventCount}, textChunks=${textChunkCount}):`,
      msg,
    )
    throw err
  }
}

// ─── Ollama implementation (legacy fallback) ────────────────────────────────

interface OpenAIChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

function buildOllamaMessages(opts: ChatOptions): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  messages.push({ role: 'user', content: opts.prompt })
  return messages
}

function buildOllamaBody(opts: ChatOptions, stream: boolean) {
  return {
    model:       opts.model ?? llmModel(opts.task),
    messages:    buildOllamaMessages(opts),
    stream,
    temperature: opts.temperature ?? 0.7,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
  }
}

function ollamaHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = process.env.OLLAMA_API_KEY
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

async function chatOllama(opts: ChatOptions): Promise<string> {
  const res = await fetch(`${llmBaseUrl()}/chat/completions`, {
    method:  'POST',
    headers: ollamaHeaders(),
    body:    JSON.stringify(buildOllamaBody(opts, false)),
    signal:  opts.signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`LLM request failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

async function* chatStreamOllama(opts: ChatOptions): AsyncGenerator<string> {
  const res = await fetch(`${llmBaseUrl()}/chat/completions`, {
    method:  'POST',
    headers: ollamaHeaders(),
    body:    JSON.stringify(buildOllamaBody(opts, true)),
    signal:  opts.signal,
  })
  if (!res.ok || !res.body) {
    const detail = res.body ? await res.text().catch(() => '') : ''
    throw new Error(`LLM stream failed (${res.status}): ${detail.slice(0, 200)}`)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line.
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of frame.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') return
        try {
          const json  = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
          const delta = json.choices?.[0]?.delta?.content
          if (delta) yield delta
        } catch {
          // ignore keep-alive / partial frames
        }
      }
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Extract the first balanced JSON object/array from a model response. */
export function extractJson(text: string): string | null {
  const obj = text.match(/\{[\s\S]*\}/)
  const arr = text.match(/\[[\s\S]*\]/)
  if (obj && arr) return obj.index! <= arr.index! ? obj[0] : arr[0]
  return obj?.[0] ?? arr?.[0] ?? null
}
