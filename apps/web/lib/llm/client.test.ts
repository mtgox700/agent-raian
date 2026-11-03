import { describe, it, expect, vi, afterEach } from 'vitest'
import { chat, chatStream, llmModel, isLlmConfigured, extractJson } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('config helpers', () => {
  it('llmModel defaults to qwen3.5 and respects OLLAMA_MODEL', () => {
    vi.stubEnv('OLLAMA_MODEL', '')
    vi.stubEnv('OLLAMA_MODEL_CLASSIFY', '')
    expect(llmModel()).toBe('qwen3.5')
    vi.stubEnv('OLLAMA_MODEL', 'glm-5.1')
    expect(llmModel()).toBe('glm-5.1')
  })
  it('llmModel routes per task with override, falling back to OLLAMA_MODEL', () => {
    vi.stubEnv('OLLAMA_MODEL', 'qwen3.5')
    vi.stubEnv('OLLAMA_MODEL_CLASSIFY', 'gpt-oss')
    expect(llmModel('classify')).toBe('gpt-oss')   // task override wins
    expect(llmModel('score')).toBe('qwen3.5')        // no override → global
  })
  it('isLlmConfigured tracks OLLAMA_API_KEY', () => {
    vi.stubEnv('OLLAMA_API_KEY', '')
    expect(isLlmConfigured()).toBe(false)
    vi.stubEnv('OLLAMA_API_KEY', 'sk-xxx')
    expect(isLlmConfigured()).toBe(true)
  })
})

describe('extractJson', () => {
  it('pulls an object out of surrounding prose', () => {
    expect(extractJson('here you go ```json {"a":1} ``` done')).toBe('{"a":1}')
  })
  it('pulls an array', () => {
    expect(extractJson('result: [1,2,3] end')).toBe('[1,2,3]')
  })
  it('returns null when no JSON', () => {
    expect(extractJson('no json here')).toBeNull()
  })
})

describe('chat', () => {
  it('posts to the chat completions endpoint and returns the message text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello world' } }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OLLAMA_API_KEY', 'sk-test')
    vi.stubEnv('OLLAMA_BASE_URL', 'http://host:11434/v1')

    const out = await chat({ prompt: 'hi', json: true })
    expect(out).toBe('hello world')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://host:11434/v1/chat/completions')
    const body = JSON.parse(init.body)
    expect(body.stream).toBe(false)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(init.headers.Authorization).toBe('Bearer sk-test')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }))
    await expect(chat({ prompt: 'x' })).rejects.toThrow(/500/)
  })
})

describe('chatStream', () => {
  function sseStream(frames: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        for (const f of frames) controller.enqueue(enc.encode(f))
        controller.close()
      },
    })
  }

  it('yields text deltas from the SSE stream and stops on [DONE]', async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: sseStream(frames) }))

    const chunks: string[] = []
    for await (const c of chatStream({ prompt: 'hi' })) chunks.push(c)
    expect(chunks.join('')).toBe('Hello')
  })
})
