import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import type { PrismaClient } from '@prisma/client'
import type { AgentModel, ModelRequest, ModelTurn } from '@/lib/llm/agent'
import { MESSAGES, parseObjections, runAnalyst } from './run'
import { cleanHistory, modelMode } from './service'

const usage = { model: 'claude-opus-5-5', inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }
const say = (t: string): ModelTurn => ({ content: [{ type: 'text', text: t, citations: null }] as Anthropic.ContentBlock[], stopReason: 'end_turn', usage })
const useTool = (name: string): ModelTurn => ({ content: [{ type: 'tool_use', id: 'tu', name, input: {} }] as unknown as Anthropic.ContentBlock[], stopReason: 'tool_use', usage })

function scripted(turns: ModelTurn[]): AgentModel & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = []
  return { name: 'claude-opus-5-5', requests, async create(req) { requests.push(structuredClone(req)); const t = turns.shift(); if (!t) throw new Error('script exhausted'); return t } }
}

const answer = (body: string) => `**Réponse** : ${body}\n\n**Preuves**\n- rien\n\n**Ce qu’on ne sait pas**\n- tout\n\n**Que faire**\n1. Attendre.`
// No tool here touches the database: an unknown tool is refused by the session itself.
const ctx = { db: {} as PrismaClient, scope: { workspaceId: 'w', userId: 'u', role: 'OWNER' as const } }

describe('runAnalyst', () => {
  const clean = () => say('{"objections":[]}')

  it('no data consulted: the scope refusal, whatever the draft claims', async () => {
    const orchestrator = scripted([say(answer('Votre campagne Alpha est la plus performante.'))])
    const devil = scripted([])
    const res = await runAnalyst({ question: 'Écris un poème', ctx, models: { orchestrator, devil } })
    expect(res).toMatchObject({ status: 'refused', text: MESSAGES.refusal })
    expect(devil.requests).toHaveLength(0)
  })

  it('delivers a verified, cited answer after a clean review', async () => {
    const orchestrator = scripted([useTool('nope'), say(answer('Rien à signaler [T1].'))])
    const res = await runAnalyst({ question: 'Q', ctx, models: { orchestrator, devil: scripted([clean()]) } })
    expect(res).toMatchObject({ status: 'ok', devil: 'ok', revised: false })
    expect(res.evidence.map((e) => e.ref)).toEqual(['T1'])
  })

  it('sends an invented number back once, then refuses rather than deliver it', async () => {
    const orchestrator = scripted([useTool('nope'), say(answer('Votre taux sera de 12 % le mois prochain [T1].')), say(answer('Toujours 12 % [T9].'))])
    const res = await runAnalyst({ question: 'Mon taux le mois prochain ?', ctx, models: { orchestrator, devil: scripted([clean()]) } })
    expect(res.status).toBe('refused')
    expect(res.text).toBe(MESSAGES.unverified)
    expect(res.revised).toBe(true)
    expect(res.faults.map((f) => f.kind)).toEqual(expect.arrayContaining(['citation_inconnue', 'nombre_non_source']))
    expect(String(orchestrator.requests[2].messages.at(-1)?.content)).toContain('nombre_non_source')
  })

  it('an uncited answer is corrected, then delivered', async () => {
    const orchestrator = scripted([useTool('nope'), say(answer('Aucune donnée ne permet de répondre.')), say(answer('Aucune donnée ne permet de répondre [T1].'))])
    const res = await runAnalyst({ question: 'Q', ctx, models: { orchestrator, devil: scripted([clean()]) } })
    expect(res).toMatchObject({ status: 'ok', revised: true })
    expect(String(orchestrator.requests[2].messages.at(-1)?.content)).toContain('sans_preuve')
  })

  it('the devil sees the draft and the results as data, never the question; her objections force a revision', async () => {
    const orchestrator = scripted([useTool('drop_database'), say(answer('Ce message est meilleur [T1].')), say(answer('On ne peut pas savoir [T1].'))])
    const devil = scripted([say('{"objections":[{"type":"correlation","affirmation":"meilleur","action":"retrograder","explication":"non démontré"}]}')])
    const res = await runAnalyst({ question: 'SECRET-QUESTION', ctx, models: { orchestrator, devil } })
    expect(res).toMatchObject({ status: 'ok', devil: 'ok', revised: true })
    const seen = JSON.stringify(devil.requests[0])
    expect(seen).not.toContain('SECRET-QUESTION')
    expect(JSON.stringify(devil.requests[0].messages).match(/UNTRUSTED_CONTENT_START/g)).toHaveLength(2)
    expect(String(orchestrator.requests[2].messages.at(-1)?.content)).toContain('retrograder')
    expect(res.usage.map((u) => u.task)).toEqual(['analyst.orchestrator', 'analyst.orchestrator', 'analyst.devil', 'analyst.revision'])
  })

  it('an unreadable devil is retried once, then the draft is revised as contested', async () => {
    const orchestrator = scripted([useTool('nope'), say(answer('Rien à signaler [T1].')), say(answer('Rien de démontré [T1].'))])
    const devil = scripted([say('je pense que oui'), { ...say(''), stopReason: 'max_tokens' }])
    const res = await runAnalyst({ question: 'Q', ctx, models: { orchestrator, devil } })
    expect(devil.requests).toHaveLength(2)
    expect(res).toMatchObject({ status: 'ok', devil: 'illisible', revised: true })
    expect(String(orchestrator.requests[2].messages.at(-1)?.content)).toContain('relecture_indisponible')
  })

  it('every paid call reaches the sink, even when a later one throws', async () => {
    const orchestrator = scripted([useTool('nope'), say(answer('ok [T1].'))])
    const devil: AgentModel = { name: 'claude-opus-5-5', async create() { throw new Error('overloaded') } }
    const sink: Parameters<typeof runAnalyst>[0]['usageSink'] = []
    await expect(runAnalyst({ question: 'Q', ctx, models: { orchestrator, devil }, usageSink: sink })).rejects.toThrow('overloaded')
    expect(sink).toHaveLength(2)
  })

  it('a model refusal or a run without an answer is never shown raw', async () => {
    const refusal = await runAnalyst({ question: 'Q', ctx, models: { orchestrator: scripted([{ ...say(''), stopReason: 'refusal' }]), devil: scripted([]) } })
    expect(refusal).toMatchObject({ status: 'refused', text: MESSAGES.refusal })
    const cut = await runAnalyst({ question: 'Q', ctx, models: { orchestrator: scripted([{ ...say('moit'), stopReason: 'max_tokens' }]), devil: scripted([]) } })
    expect(cut).toMatchObject({ status: 'error', text: MESSAGES.error })
  })

  it('caps the question length sent to the model', async () => {
    const orchestrator = scripted([say(answer('ok'))])
    await runAnalyst({ question: 'x'.repeat(10_000), ctx, models: { orchestrator, devil: scripted([]) } })
    expect(String(orchestrator.requests[0].messages.at(-1)?.content).length).toBe(2_000)
  })
})

describe('cleanHistory', () => {
  it('starts with the user, alternates, drops old references and pending answers', () => {
    expect(cleanHistory([
      { role: 'assistant', content: 'orpheline' },
      { role: 'user', content: 'Q1' },
      { role: 'user', content: 'Q1 bis' },
      { role: 'assistant', content: '12 réponses [T2].', status: 'ok' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: '', status: 'pending' },
    ])).toEqual([
      { role: 'user', content: 'Q1\n\nQ1 bis' },
      { role: 'assistant', content: '12 réponses.' },
    ])
  })
})

describe('parseObjections', () => {
  it('reads the JSON even with text around, rejects anything else', () => {
    expect(parseObjections('Voici : {"objections":[]} fin')).toEqual([])
    expect(parseObjections('{"objections":"non"}')).toBeNull()
    expect(parseObjections('rien')).toBeNull()
  })
})

describe('modelMode', () => {
  it('uses the real model with a key, the sandbox only locally on request, otherwise nothing', () => {
    // The key alone (already there for lead scoring) never turns paid answers on.
    expect(modelMode({ ANTHROPIC_API_KEY: 'k' })).toBe('none')
    expect(modelMode({ ANTHROPIC_API_KEY: 'k', ANALYST_LIVE: '1' })).toBe('anthropic')
    expect(modelMode({ ANALYST_LIVE: '1' })).toBe('none')
    expect(modelMode({ ANALYST_SANDBOX_MODEL: '1', NODE_ENV: 'development' })).toBe('sandbox')
    expect(modelMode({ ANALYST_SANDBOX_MODEL: '1', NODE_ENV: 'production' })).toBe('none')
    expect(modelMode({ ANALYST_SANDBOX_MODEL: '1', NODE_ENV: 'development', VERCEL_ENV: 'preview' })).toBe('none')
    expect(modelMode({ ANALYST_SANDBOX_MODEL: '1', NODE_ENV: 'development', ANTHROPIC_API_KEY: 'k' })).toBe('sandbox')
    expect(modelMode({ ANALYST_SANDBOX_MODEL: '1', NODE_ENV: 'production', ANTHROPIC_API_KEY: 'k', ANALYST_LIVE: '1' })).toBe('anthropic')
    expect(modelMode({})).toBe('none')
  })
})
