import { describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { costMicroUsd, runAgentLoop, type AgentModel, type ModelRequest, type ModelTurn } from './agent'

const usage = { model: 'claude-opus-5-5', inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }
const text = (t: string): ModelTurn => ({ content: [{ type: 'text', text: t, citations: null }] as Anthropic.ContentBlock[], stopReason: 'end_turn', usage })
const tool = (name: string, input: unknown, id = 'tu_1'): ModelTurn => ({
  content: [{ type: 'thinking', thinking: 'plan', signature: 'sig' }, { type: 'tool_use', id, name, input }] as unknown as Anthropic.ContentBlock[],
  stopReason: 'tool_use', usage,
})

function scripted(turns: ModelTurn[]): AgentModel & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = []
  return {
    name: 'scripted', requests,
    async create(req) {
      requests.push(structuredClone(req))
      const next = turns.shift()
      if (!next) throw new Error('script exhausted')
      return next
    },
  }
}

describe('runAgentLoop', () => {
  it('runs a tool, returns its result to the model, then the final text', async () => {
    const model = scripted([tool('list_campaigns', {}), text('Réponse finale')])
    const execute = vi.fn(async () => ({ content: '{"ref":"T1"}', isError: false }))
    const run = await runAgentLoop({ model, system: 'S', messages: [{ role: 'user', content: 'Q' }], execute })
    expect(run).toMatchObject({ text: 'Réponse finale', stop: 'end_turn' })
    expect(execute).toHaveBeenCalledWith('list_campaigns', {})
    expect(run.usage).toHaveLength(2)
    const second = model.requests[1].messages
    // The thinking block goes back unchanged, then the tool result.
    expect((second[1].content as Array<{ type: string }>).map((b) => b.type)).toEqual(['thinking', 'tool_use'])
    expect(second[2].content).toEqual([{ type: 'tool_result', tool_use_id: 'tu_1', content: '{"ref":"T1"}', is_error: false }])
  })

  it('a failing tool becomes an error result, never a crash', async () => {
    const model = scripted([tool('x', {}), text('ok')])
    const run = await runAgentLoop({ model, system: 'S', messages: [{ role: 'user', content: 'Q' }], execute: async () => { throw new Error('db down') } })
    expect(run.stop).toBe('end_turn')
    const result = (model.requests[1].messages[2].content as Array<{ is_error: boolean; content: string }>)[0]
    expect(result.is_error).toBe(true)
    expect(result.content).not.toContain('db down')
  })

  it('stops after maxSteps when the model keeps calling tools', async () => {
    const model = scripted(Array.from({ length: 5 }, (_, i) => tool('x', {}, `tu_${i}`)))
    const run = await runAgentLoop({ model, system: 'S', messages: [{ role: 'user', content: 'Q' }], maxSteps: 3, execute: async () => ({ content: '{}', isError: false }) })
    expect(run.stop).toBe('max_steps')
    expect(model.requests).toHaveLength(3)
  })

  it('reports a refusal and a truncated answer as such', async () => {
    const refused = await runAgentLoop({ model: scripted([{ ...text(''), stopReason: 'refusal' }]), system: 'S', messages: [{ role: 'user', content: 'Q' }] })
    expect(refused.stop).toBe('refusal')
    const cut = await runAgentLoop({ model: scripted([{ ...text('moitié'), stopReason: 'max_tokens' }]), system: 'S', messages: [{ role: 'user', content: 'Q' }] })
    expect(cut).toMatchObject({ stop: 'max_tokens', text: 'moitié' })
  })

  it('never mutates the messages it is given', async () => {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: 'Q' }]
    await runAgentLoop({ model: scripted([text('ok')]), system: 'S', messages })
    expect(messages).toHaveLength(1)
  })
})

describe('costMicroUsd', () => {
  it('prices input, output and cache at the published rates', () => {
    // 1 000 × 4 $ + 100 × 20 $ per million = 0.006 $
    expect(costMicroUsd(usage)).toBe(6000)
    expect(costMicroUsd({ ...usage, inputTokens: 0, outputTokens: 0, cacheReadTokens: 10_000, cacheWriteTokens: 1_000 })).toBe(2000 + 5000)
  })

  it('prices an unknown model as the dearest, never as free', () => {
    expect(costMicroUsd({ ...usage, model: 'claude-next' })).toBe(6000)
  })
})
