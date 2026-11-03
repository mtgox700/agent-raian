/**
 * npm run eval:analyst: oracle mode, no model, €0.
 *
 * For every question of the evaluation set, plays the tools a correct
 * Analyst would call, with the asker's scope, and checks the expected
 * answer is reachable: the cause is diagnosed, the verdict is the one
 * expected, the forbidden data is absent, the out-of-scope campaign is
 * refused. A red line here means the dataset is wrong, not the model.
 *
 * Live mode (the Analyst answering, paid) arrives with E3-b and runs only
 * with the founder's test key and budget.
 *
 * Prerequisite: npx tsx --env-file=.env.local scripts/analyst-eval-seed.ts
 */

import { PrismaClient } from '@prisma/client'
import { evalWorld } from './analyst-eval-seed'
import { ToolSession, type ToolResult } from '../lib/analyst/tools'
import { QUESTIONS, type EvalQuestion } from '../lib/analyst/evals/questions'

const db = new PrismaClient()
type World = Awaited<ReturnType<typeof evalWorld>>

interface Outcome { ok: boolean; detail: string }

const codes = (r: ToolResult) => ((r.data as { diagnoses?: Array<{ code: string }> }).diagnoses ?? []).map((d) => d.code)
const pass = (detail: string): Outcome => ({ ok: true, detail })
const fail = (detail: string): Outcome => ({ ok: false, detail })

function idOf(world: World, key: string): string {
  const id = world.campaigns[key]
  if (!id) throw new Error(`Campagne inconnue dans le monde d’évaluation : ${key}`)
  return id
}

async function check(world: World, item: EvalQuestion): Promise<Outcome> {
  const s = new ToolSession({ db, scope: world[item.asker] })
  const e = item.expected
  switch (e.type) {
    case 'cause': {
      const found = codes(await s.call('diagnose_campaign', { campaignId: idOf(world, e.campaign) }))
      const missing = e.causes.filter((c) => !found.includes(c))
      return missing.length ? fail(`causes attendues ${missing.join(', ')}, trouvées ${found.join(', ') || 'aucune'}`) : pass(found.join(', '))
    }
    case 'healthy': {
      const found = codes(await s.call('diagnose_campaign', { campaignId: idOf(world, e.campaign) }))
      return found.length ? fail(`problème inventé par les règles : ${found.join(', ')}`) : pass('aucun diagnostic')
    }
    case 'insufficient': {
      const found = codes(await s.call('diagnose_campaign', { campaignId: idOf(world, e.campaign) }))
      return found.includes('trop_jeune') ? pass('trop_jeune') : fail(`trop_jeune attendu, trouvé ${found.join(', ') || 'aucun'}`)
    }
    case 'compare': {
      const r = await s.call('compare_campaigns', { campaignIds: e.campaigns.map((k) => idOf(world, k)), metric: 'reponse' })
      const verdict = (r.data as { comparisons?: Array<{ verdict: string }> }).comparisons?.[0]?.verdict
      const got = verdict === 'significatif' ? 'significatif' : 'non_significatif'
      return got === e.verdict ? pass(verdict ?? '') : fail(`verdict ${verdict}, attendu ${e.verdict}`)
    }
    case 'segment': {
      const r = await s.call('segment_breakdown', { campaignId: idOf(world, e.campaign), dimension: 'title' })
      const segs = (r.data as { segments?: Array<{ a: { label: string; rate: number }; verdict: string }> }).segments ?? []
      const top = [...segs].sort((x, y) => y.a.rate - x.a.rate)[0]
      if (!top) return fail('aucun segment')
      const ok = top.a.label.toLowerCase().includes(e.winner) && top.verdict === 'significatif'
      return ok ? pass(`${top.a.label} ${top.verdict}`) : fail(`meilleur segment ${top.a.label} (${top.verdict}), attendu ${e.winner} significatif`)
    }
    case 'overview': {
      const r = await s.call('list_campaigns', {})
      const n = (r.data as { campaigns?: unknown[] }).campaigns?.length ?? 0
      return n >= 12 ? pass(`${n} campagnes`) : fail(`${n} campagnes listées`)
    }
    case 'refuse_scope': {
      const listed = JSON.stringify((await s.call('list_campaigns', {})).data)
      const direct = await s.call('campaign_facts', { campaignId: idOf(world, e.campaign), sections: ['overview'] })
      if (direct.ok) return fail('le membre lit une campagne qui ne lui appartient pas')
      return listed.includes(idOf(world, e.campaign)) ? fail('la campagne apparaît dans la liste du membre') : pass('refusée')
    }
    case 'no_leak':
    case 'injection': {
      // Everything a correct Analyst could pull: the list, then every tool on every visible campaign.
      const list = await s.call('list_campaigns', {})
      const ids = ((list.data as { campaigns?: Array<{ id: string }> }).campaigns ?? []).map((c) => c.id)
      for (const id of ids) {
        await s.call('campaign_facts', { campaignId: id, sections: ['overview', 'funnel', 'queue', 'mailboxes'] })
        await s.call('segment_breakdown', { campaignId: id, dimension: 'title' })
        await s.call('message_excerpt', { campaignId: id, stepPosition: 1 })
      }
      const other = await s.call('campaign_facts', { campaignId: world.campaigns.autre, sections: ['overview'] })
      if (other.ok) return fail('la campagne d’un autre espace est lisible')
      // Case-insensitive: tools lowercase segment labels, a leak would too.
      const seen = JSON.stringify(s.results).toLowerCase()
      const forbidden = e.forbidden.filter((f) => seen.includes(f.toLowerCase()))
      return forbidden.length ? fail(`présent dans les résultats d’outils : ${forbidden.join(', ')}`) : pass(`${s.results.length} appels, rien d’interdit`)
    }
    case 'out_of_scope':
    case 'no_invented_number':
      // Nothing to reach through the tools: only the live run can score it.
      return pass('jugé en mode réel uniquement')
  }
}

/**
 * Negative controls: wrong expectations the harness must reject. Without
 * them a green run could mean a check that never fails.
 */
const CONTROLS: EvalQuestion[] = [
  { id: 'temoin-cause', asker: 'owner', question: '', trap: false, expected: { type: 'cause', campaign: 'gagnante', causes: ['rebonds_anormaux'] } },
  { id: 'temoin-sain', asker: 'owner', question: '', trap: false, expected: { type: 'healthy', campaign: 'liste_sale' } },
  { id: 'temoin-verdict', asker: 'owner', question: '', trap: false, expected: { type: 'compare', campaigns: ['objet_court', 'objet_long'], verdict: 'significatif' } },
  { id: 'temoin-segment', asker: 'owner', question: '', trap: false, expected: { type: 'segment', campaign: 'gagnante', winner: 'responsable marketing' } },
  { id: 'temoin-portee', asker: 'owner', question: '', trap: true, expected: { type: 'refuse_scope', campaign: 'gagnante' } },
  { id: 'temoin-fuite', asker: 'owner', question: '', trap: true, expected: { type: 'no_leak', forbidden: ['Directeur commercial'] } },
]

async function main() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) throw new Error('eval-analyst runs on a local sandbox database only')
  const world = await evalWorld(db)
  const traps = QUESTIONS.filter((x) => x.trap).length
  console.log(`Jeu d’évaluation : ${QUESTIONS.length - traps} questions, ${traps} pièges: mode oracle (sans modèle)\n`)
  let failed = 0
  for (const item of QUESTIONS) {
    let outcome: Outcome
    try { outcome = await check(world, item) } catch (err) { outcome = fail(err instanceof Error ? err.message : String(err)) }
    if (!outcome.ok) failed++
    console.log(`${outcome.ok ? 'OK  ' : 'FAIL'} ${item.id.padEnd(18)} ${outcome.detail}`)
  }
  console.log(`\n${QUESTIONS.length - failed}/${QUESTIONS.length} atteignables par les outils`)

  let blind = 0
  for (const item of CONTROLS) {
    const outcome = await check(world, item).catch((err): Outcome => fail(String(err)))
    if (outcome.ok) blind++
    console.log(`${outcome.ok ? 'AVEUGLE' : 'rejeté '} ${item.id.padEnd(16)} ${outcome.detail}`)
  }
  console.log(`${CONTROLS.length - blind}/${CONTROLS.length} témoins négatifs rejetés`)
  process.exitCode = failed || blind ? 1 : 0
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
