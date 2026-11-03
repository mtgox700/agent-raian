/**
 * SANDBOX ONLY: a scripted stand-in for the model, no network, no cost.
 * It speaks the same protocol (tool calls, then a text answer) so the whole
 * path runs in the browser before any paid call: tools with the asker's
 * scope, devil's advocate, verifier, persistence, screen. Its answers are
 * plain compositions of the facts engine's diagnoses, and the screen says so.
 *
 * Enabled by ANALYST_SANDBOX_MODEL=1, never on Vercel nor in a production
 * build (service.ts, modelMode). Not the product: the Analyst is the model.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { AgentModel, ModelRequest, ModelTurn } from '@/lib/llm/agent'
import { DEVIL_PROMPT } from './prompts'

export const SANDBOX_MODEL_NAME = 'sandbox-scripted'

interface Seen { ref: string; [k: string]: unknown }
interface Rate { successes: number; n: number; rate: number }
interface Listed { id: string; name: string; replyRate: Rate }
interface Diag { title: string; evidence: string[]; next: string; code: string }

const ANALYTIC = /campagn|r[ée]pon|envo|bloqu|meilleur|compar|segment|cibl|message|chang|semaine|bo[iî]te|rebond|marche|probl|sant[ée]|avanc|stagn|r[ée]sum|pourquoi|qualit|liste|test|\bbat|taux|cible/i

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function turn(content: unknown[], stopReason: Anthropic.StopReason): ModelTurn {
  return {
    content: content as Anthropic.ContentBlock[],
    stopReason,
    usage: { model: SANDBOX_MODEL_NAME, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  }
}
const say = (text: string) => turn([{ type: 'text', text, citations: null }], 'end_turn')
let callId = 0
const call = (calls: Array<{ name: string; input: Record<string, unknown> }>) =>
  turn(calls.map((c) => ({ type: 'tool_use', id: `sbx_${++callId}`, name: c.name, input: c.input })), 'tool_use')

function textOfMessage(m: Anthropic.MessageParam): string {
  if (typeof m.content === 'string') return m.content
  return m.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

/** The question of the current exchange and every tool result seen since. */
function state(messages: Anthropic.MessageParam[]) {
  let question = ''
  const seen: Seen[] = []
  for (const m of messages) {
    if (m.role !== 'user') continue
    if (typeof m.content !== 'string' && m.content.some((b) => b.type === 'tool_result')) {
      for (const b of m.content) {
        if (b.type !== 'tool_result' || typeof b.content !== 'string') continue
        try { seen.push(JSON.parse(b.content) as Seen) } catch { /* not ours */ }
      }
    } else {
      const text = textOfMessage(m)
      if (!text.startsWith('Relecture de ton brouillon')) { question = text; seen.length = 0 }
    }
  }
  return { question, seen }
}

function matching(question: string, campaigns: Listed[]): Listed[] {
  const q = norm(question)
  return campaigns.filter((c) => {
    const name = norm(c.name)
    if (q.includes(name)) return true
    const tail = name.split(' : ').pop() ?? name
    return tail.split(/\s+/).some((w) => w.length > 4 && q.includes(w))
  })
}

const pct = (r: Rate) => `${(r.rate * 100).toFixed(1).replace('.', ',')} %`

function compose(seen: Seen[], question = ''): string {
  const list = seen.find((s) => Array.isArray(s.campaigns))
  const campaigns = (list?.campaigns ?? []) as Listed[]
  const diagnosed = seen.filter((s) => Array.isArray(s.diagnoses)) as Array<Seen & { name: string; campaignId: string; diagnoses: Diag[] }>
  const compared = seen.find((s) => Array.isArray(s.comparisons)) as (Seen & { comparisons: Array<{ a: { label: string } & Rate; b: { label: string } & Rate; verdict: string; reason: string | null }> }) | undefined
  const segments = seen.find((s) => Array.isArray(s.segments)) as (Seen & { segments: Array<{ a: { label: string } & Rate; verdict: string }> }) | undefined

  const problems = diagnosed.filter((d) => d.diagnoses.length > 0)
  const rateOf = (id: string) => campaigns.find((c) => c.id === id)
  const answer: string[] = []
  const proofs: string[] = []
  const unknown: string[] = []
  const actions: string[] = []

  // A campaign named in the question that the tools did not return: say so.
  const missing = [...question.matchAll(/«\s*([^»]+?)\s*»/g)].map((m) => m[1]).filter((q) => !campaigns.some((c) => norm(c.name).includes(norm(q))))
  if (missing.length) answer.push(`Je ne trouve pas ${missing.map((m) => `« ${m} »`).join(', ')} parmi les campagnes auxquelles vous avez accès.`)
  if (compared) {
    const c = compared.comparisons[0]
    const [hi, lo] = c.a.rate >= c.b.rate ? [c.a, c.b] : [c.b, c.a]
    const gap = `« ${hi.label} » répond plus que « ${lo.label} » (${pct(hi)} contre ${pct(lo)})`
    answer.push(c.verdict === 'significatif' ? `${gap}, et l’écart est significatif [${compared.ref}].`
      : c.verdict === 'tendance' ? `${gap}, un écart à surveiller, non démontré [${compared.ref}].`
      : `On ne peut pas encore départager « ${c.a.label} » et « ${c.b.label} » : trop peu de données [${compared.ref}].`)
    // The figures of each side, from the comparison itself: never the list of every campaign.
    for (const side of [c.a, c.b]) proofs.push(`- « ${side.label} » : ${pct(side)}, ${side.successes} réponse${side.successes > 1 ? 's' : ''} sur ${side.n} contactés [${compared.ref}]`)
    if (c.verdict !== 'significatif') unknown.push(c.reason ?? 'Lequel des deux messages convainc le plus : il faut plus de réponses pour le dire.')
  }
  if (problems.length > 0) {
    answer.push(`À regarder : ${problems.map((d) => `« ${d.name} » (${d.diagnoses[0].title.toLowerCase()})`).join(', ')}.`)
  } else if (diagnosed.length > 0 && !compared) {
    answer.push('Aucun blocage détecté sur les campagnes analysées.')
  }
  const ordered = [...problems, ...diagnosed.filter((d) => d.diagnoses.length === 0)]
  for (const d of ordered.slice(0, 5)) {
    const r = rateOf(d.campaignId)
    const rate = r && list ? `taux de réponse ${pct(r.replyRate)}, ${r.replyRate.successes} réponse${r.replyRate.successes > 1 ? 's' : ''} sur ${r.replyRate.n} contactés [${list.ref}]` : ''
    const first = d.diagnoses[0]
    proofs.push(`- « ${d.name} » : ${first ? `${first.evidence.join(', ')} [${d.ref}]` : `aucun diagnostic [${d.ref}]`}${rate ? ` ; ${rate}` : ''}`)
    for (const x of d.diagnoses) if (actions.length < 3) actions.push(`${actions.length + 1}. ${x.next} [${d.ref}]`)
    if (d.diagnoses.some((x) => x.code === 'trop_jeune')) unknown.push(`Si « ${d.name} » marchera : il est trop tôt pour conclure.`)
  }
  if (segments) {
    const top = [...segments.segments].sort((a, b) => b.a.rate - a.a.rate)[0]
    if (top) proofs.push(`- Segment le plus réactif : ${top.a.label}, ${pct(top.a)} (${top.verdict}, exploratoire) [${segments.ref}]`)
  }
  if (answer.length === 0) answer.push('Voici ce que montrent vos campagnes.')
  if (proofs.length === 0 && list) proofs.push(campaigns.length ? `- Campagnes consultées : ${campaigns.slice(0, 5).map((c) => `« ${c.name} »`).join(", ")} [${list.ref}]` : `- Aucune campagne visible pour vous dans cet espace [${list.ref}]`)
  unknown.push('Ces règles repèrent les blocages et les écarts mesurables ; elles ne disent pas si l’offre convainc.')
  if (actions.length === 0) actions.push('1. Continuer à suivre les réponses cette semaine.')

  return [`**Réponse** : ${answer.join(' ')}`, '', '**Preuves**', ...proofs, '', '**Ce qu’on ne sait pas**', ...unknown.map((u) => `- ${u}`), '', '**Que faire**', ...actions].join('\n')
}

const OUT_OF_SCOPE = [
  '**Réponse** : Je ne peux pas répondre à cette demande : je n’analyse que les campagnes de cet espace.',
  '', '**Preuves**', '- Aucune donnée consultée.',
  '', '**Ce qu’on ne sait pas**', '- Rien, la question sort de mon périmètre.',
  '', '**Que faire**', '1. Demandez par exemple : « Quelles campagnes sont bloquées en ce moment ? »',
].join('\n')

export function sandboxModel(): AgentModel {
  return {
    name: SANDBOX_MODEL_NAME,
    async create(req: ModelRequest): Promise<ModelTurn> {
      if (req.system === DEVIL_PROMPT) return say('{"objections":[]}')
      const { question, seen } = state(req.messages)
      const last = req.messages[req.messages.length - 1]
      if (last && last.role === 'user' && textOfMessage(last).startsWith('Relecture de ton brouillon')) return say(compose(seen, question))

      if (seen.length === 0) return ANALYTIC.test(question) ? call([{ name: 'list_campaigns', input: {} }]) : say(OUT_OF_SCOPE)
      const list = seen.find((s) => Array.isArray(s.campaigns))
      const done = seen.some((s) => Array.isArray(s.diagnoses) || Array.isArray(s.comparisons) || 'error' in s)
      if (list && !done) {
        const campaigns = list.campaigns as Listed[]
        if (campaigns.length === 0) return say(compose(seen, question))
        const named = matching(question, campaigns)
        if (/compar|departag|versus|\bvs\b|entre .* et |mieux|ecart|\bbat\b/.test(norm(question)) && named.length >= 2) {
          return call([{ name: 'compare_campaigns', input: { campaignIds: named.slice(0, 5).map((c) => c.id), metric: 'reponse' } }])
        }
        const targets = named.length ? named.slice(0, 3) : campaigns.slice(0, 20)
        const calls = targets.map((c) => ({ name: 'diagnose_campaign', input: { campaignId: c.id } as Record<string, unknown> }))
        if (named.length === 1 && /qui r[ée]pond|segment|cibl|qui faut/i.test(question)) calls.push({ name: 'segment_breakdown', input: { campaignId: named[0].id, dimension: 'title' } })
        return call(calls)
      }
      return say(compose(seen, question))
    },
  }
}
