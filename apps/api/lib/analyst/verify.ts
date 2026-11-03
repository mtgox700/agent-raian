/**
 * The Analyst's last gate, deterministic: an answer that fails here is sent
 * back once, then refused : never delivered.
 *
 *   1. Every number in the answer exists in a tool result of the
 *      conversation, and in the result it CITES ([T3]): a true number taken
 *      from another campaign's result is still a fault. Declared rounding:
 *      a rate may be written as a percentage with 0 or 1 decimal.
 *   2. A sentence with a number cites its source.
 *   3. A comparison that E2 judged 'tendance' or 'insuffisant' is not
 *      strengthened: no "meilleur", "plus efficace", "prouvé", "grâce à"…
 *      unless a cited comparison is 'significatif'.
 *   4. The format: Réponse / Preuves / Ce qu'on ne sait pas / Que faire,
 *      three actions at most.
 */

import type { ToolResult } from './tools'

export type FaultKind =
  | 'nombre_non_source'
  | 'nombre_mal_attribue'
  | 'nombre_sans_citation'
  | 'citation_inconnue'
  | 'verdict_renforce'
  | 'structure'
  | 'trop_d_actions'
  | 'sans_preuve'

export interface Fault { kind: FaultKind; detail: string }
export interface Verification { ok: boolean; faults: Fault[] }

const SECTIONS = [
  { key: 'reponse', re: /^\s*(?:#+\s*|\*\*)?réponse\b/im },
  { key: 'preuves', re: /^\s*(?:#+\s*|\*\*)?preuves\b/im },
  { key: 'inconnu', re: /^\s*(?:#+\s*|\*\*)?ce qu['’]on ne sait pas\b/im },
  { key: 'actions', re: /^\s*(?:#+\s*|\*\*)?que faire\b/im },
] as const

const STRONG = /\b(?:meilleure?s?|plus efficaces?|surperforme\w*|prouvée?s?|cause\w*)\b|\bgrâce\s+(?:à|au|aux)(?![\p{L}\d])|(?<!non )\bdémontrée?s?\b/iu
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T/
/** Keys whose text the facts engine writes (diagnose.ts), never the customer. */
const ENGINE_TEXT = new Set(['evidence', 'title', 'threshold', 'next'])

/** Canonical text of a number: dot decimal, no trailing zeros. */
function canon(n: number): string {
  return String(Number(n.toFixed(6)))
}

/** Every way a result's numbers may legitimately be written. */
export function citableNumbers(data: unknown): Set<string> {
  const out = new Set<string>()
  const add = (n: number) => {
    if (!Number.isFinite(n)) return
    out.add(canon(n))
    out.add(canon(Number(n.toFixed(1))))
    out.add(canon(Number(n.toFixed(0))))
    if (Math.abs(n) <= 1) {
      // A rate written as a percentage, 0 or 1 decimal; a delta as points.
      out.add(canon(Number((n * 100).toFixed(1))))
      out.add(canon(Number((n * 100).toFixed(0))))
      out.add(canon(Math.abs(Number((n * 100).toFixed(1)))))
      out.add(canon(Math.abs(Number((n * 100).toFixed(0)))))
    }
  }
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'number') add(v)
    else if (typeof v === 'string') {
      const d = ISO_DATE.exec(v)
      if (d) { out.add(String(Number(d[1]))); out.add(String(Number(d[2]))); out.add(String(Number(d[3]))) }
      // Sentences written by the facts engine itself ("140 messages en file").
      // Never names or titles: those come from the data and could plant a number.
      else if (ENGINE_TEXT.has(key)) for (const n of numbersIn(v)) out.add(n)
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k))
  }
  walk(data)
  return out
}

/** Numbers written in a piece of text, French conventions (10 000 ; 4,8). */
export function numbersIn(text: string): string[] {
  const joined = text
    .replace(/(\d)[^\S\r\n](?=\d{3}\b)/g, '$1')
    .replace(/\[T\d+\]/g, ' ')
    // Rule language, not data: "J+7", "P90", "95 %" of an interval label.
    .replace(/\bJ\+\d+\b/g, ' ').replace(/\bP\d{2}\b/gi, ' ').replace(/\b95\s?%\s?(?=d['’]|de confiance|:)/gi, ' ')
  const out: string[] = []
  for (const m of joined.matchAll(/(?<![\w.,])-?\d+(?:[.,]\d+)?(?![\d.,]*\d)(?!(?:er|re|ère|e|ème|eme)\b)/g)) {
    out.push(canon(Number(m[0].replace(',', '.'))))
  }
  return out
}

function hasComparisons(data: unknown): boolean {
  return !!data && typeof data === 'object' && ('comparisons' in data || 'segments' in data)
}

function verdictsOf(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const d = data as { comparisons?: Array<{ verdict?: string }>; segments?: Array<{ verdict?: string }> }
  return [...(d.comparisons ?? []), ...(d.segments ?? [])].map((c) => c.verdict ?? '')
}

/** Sentences and lines: the unit a number and its citation must share. */
function claims(text: string): string[] {
  // No cut right after a list number ("1. Reconnecter").
  return text.split(/\n+|(?<=[^\d\s][.!?;])\s+(?=[A-ZÀ-Ü«"(\-•*])/).map((s) => s.trim()).filter(Boolean)
}

function isListMarkerOnly(claim: string, nums: string[]): boolean {
  const marker = /^\s*(\d+)[.)]\s/.exec(claim)
  return !!marker && nums.length === 1 && nums[0] === marker[1]
}

export function verifyAnswer(answer: string, results: ToolResult[]): Verification {
  const faults: Fault[] = []
  const byRef = new Map(results.map((r) => [r.ref, r]))
  const citable = new Map(results.map((r) => [r.ref, citableNumbers(r.data)]))

  for (const s of SECTIONS) {
    if (!s.re.test(answer)) faults.push({ kind: 'structure', detail: `Section manquante : ${s.key}` })
  }
  const actionsPart = answer.split(/^\s*(?:#+\s*|\*\*)?que faire\b.*$/im)[1] ?? ''
  const actions = actionsPart.split('\n').filter((l) => /^\s*(?:[-•*]|\d+[.)])\s+\S/.test(l)).length
  if (actions > 3) faults.push({ kind: 'trop_d_actions', detail: `${actions} actions proposées (3 au plus).` })

  // 4. An answer delivered on data cites it at least once.
  const allRefs = [...answer.matchAll(/\[(T\d+)\]/g)].map((m) => m[1])
  if (results.length > 0 && allRefs.length === 0) faults.push({ kind: 'sans_preuve', detail: 'La réponse ne cite aucun résultat d’outil.' })
  // A comparison cited anywhere that is not significant forbids strong words
  // anywhere, cited or not: "X marche mieux" needs no digit to mislead.
  const comparedRefs = [...new Set(allRefs)].filter((ref) => hasComparisons(byRef.get(ref)?.data))
  const significant = comparedRefs.some((ref) => verdictsOf(byRef.get(ref)?.data).includes('significatif'))

  for (const claim of claims(answer)) {
    const refs = [...claim.matchAll(/\[(T\d+)\]/g)].map((m) => m[1])
    for (const ref of refs) if (!byRef.has(ref)) faults.push({ kind: 'citation_inconnue', detail: `${ref} ne correspond à aucun résultat d’outil.` })
    const nums = numbersIn(claim.replace(/^\s*\d+[.)]\s/, ' '))
    if (nums.length > 0 && refs.length === 0 && !isListMarkerOnly(claim, nums)) {
      faults.push({ kind: 'nombre_sans_citation', detail: `« ${claim.slice(0, 120)} » cite des nombres sans source.` })
      continue
    }
    for (const n of nums) {
      if (refs.some((ref) => citable.get(ref)?.has(n))) continue
      const elsewhere = [...citable.entries()].filter(([ref, set]) => !refs.includes(ref) && set.has(n)).map(([ref]) => ref)
      faults.push(elsewhere.length
        ? { kind: 'nombre_mal_attribue', detail: `${n} vient de ${elsewhere.join(', ')}, pas de ${refs.join(', ')}.` }
        : { kind: 'nombre_non_source', detail: `${n} n’apparaît dans aucun résultat d’outil.` })
    }
    const comparisonRefs = refs.filter((ref) => hasComparisons(byRef.get(ref)?.data))
    if (STRONG.test(claim)) {
      const verdicts = comparisonRefs.flatMap((ref) => verdictsOf(byRef.get(ref)?.data))
      const contested = comparisonRefs.length > 0 ? !verdicts.includes('significatif') : comparedRefs.length > 0 && !significant
      if (contested) {
        faults.push({ kind: 'verdict_renforce', detail: `« ${claim.slice(0, 120)} » affirme plus que le verdict (${[...new Set(verdicts)].join(', ') || 'non significatif'}).` })
      }
    }
  }
  return { ok: faults.length === 0, faults }
}
