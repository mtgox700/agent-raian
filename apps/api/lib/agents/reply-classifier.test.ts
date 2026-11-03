import { beforeEach, describe, expect, it, vi } from 'vitest'

const chat = vi.hoisted(() => vi.fn())
vi.mock('@/lib/llm/client', () => ({
  chat,
  extractJson: (t: string) => t,
  llmModel: () => 'test-model',
}))

import { classifyReply } from './reply-classifier'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('classifyReply', () => {
  it('uses the model answer when it is available', async () => {
    chat.mockResolvedValue('{"classification":"POSITIVE","confidence":0.9,"reason":"interested"}')
    const r = await classifyReply('Intéressé, dites-m’en plus', 'Question')
    expect(r).toMatchObject({ classification: 'POSITIVE', confidenceInt: 90, degraded: false, isAutoReply: false })
  })

  it('still recognises a meeting request when the LLM is down', async () => {
    chat.mockRejectedValue(new Error('529 overloaded'))
    const r = await classifyReply('Ok pour un call jeudi, quel créneau ?', 'Question')
    expect(r).toMatchObject({ classification: 'MEETING_REQUEST', dbClassification: 'POSITIVE', degraded: true })
  })

  it('falls back to NEUTRAL (and flags it) when nothing is clear and the LLM is down', async () => {
    chat.mockRejectedValue(new Error('timeout'))
    const r = await classifyReply('Je transmets à mon associé.', 'Question')
    expect(r).toMatchObject({ classification: 'NEUTRAL', degraded: true })
  })

  it('recognises an out-of-office answer without calling the model', async () => {
    const r = await classifyReply('Je suis absente du bureau jusqu’au 14 octobre.', 'Réponse automatique : Question')
    expect(r).toMatchObject({ isAutoReply: true, classification: 'NEUTRAL' })
    expect(chat).not.toHaveBeenCalled()
  })

  it('treats an off-format model answer like an outage', async () => {
    chat.mockResolvedValue('Sure! The reply looks positive.')
    const r = await classifyReply('Pas intéressé, merci.', 'Question')
    expect(r).toMatchObject({ classification: 'NEGATIVE', degraded: true })
  })
})
