import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { sandboxModel } from './sandbox-model'
import { verifyAnswer } from './verify'
import type { ToolResult } from './tools'

const QUESTION = 'Compare les campagnes « Alpha » et « Beta » : laquelle répond le mieux ?'
const side = (label: string, successes: number, n: number) => ({ label, successes, n, rate: successes / n, ci: { low: 0, high: 1 } })

async function answerFor(verdict: string, reason: string | null) {
  const list = { ref: 'T1', campaigns: [] }
  const compared = { ref: 'T2', comparisons: [{ metric: 'reponse', a: side('Alpha', 28, 400), b: side('Beta', 2, 164), verdict, reason }] }
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: QUESTION },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: JSON.stringify(list) }, { type: 'tool_result', tool_use_id: 'b', content: JSON.stringify(compared) }] },
    { role: 'user', content: 'Relecture de ton brouillon : rien à corriger.' },
  ]
  const turn = await sandboxModel().create({ system: 'analyst', messages, effort: 'low', maxTokens: 1000 })
  const text = turn.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const results: ToolResult[] = [
    { ref: 'T1', tool: 'list_campaigns', ok: true, data: list },
    { ref: 'T2', tool: 'compare_campaigns', ok: true, data: compared },
  ]
  return { text, verification: verifyAnswer(text, results) }
}

describe('sandbox model, comparison answers', () => {
  it.each([
    ['significatif', null, 'l’écart est significatif'],
    ['tendance', 'Écart net, mais d’autres différences peuvent l’expliquer.', 'à surveiller, non démontré'],
    ['insuffisant', 'Pas assez de données.', 'trop peu de données'],
  ])('%s: cites both sides and passes the verifier', async (verdict, reason, wording) => {
    const { text, verification } = await answerFor(verdict, reason)
    expect(verification.faults).toEqual([])
    expect(text).toContain(wording)
    expect(text).toContain('« Alpha » : 7,0 %, 28 réponses sur 400 contactés [T2]')
    expect(text).not.toContain('Campagnes consultées')
  })
})
