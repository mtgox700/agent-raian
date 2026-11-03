/**
 * POST /api/ai/campaign-from-url: "Campagne en 60 secondes".
 *
 * The user pastes their website URL; we read the homepage, and ONE LLM call
 * derives the whole campaign setup: name, goal, industry, product profile,
 * ICP (titles/sizes/geos), tone and value proposition. The client drops the
 * result into the wizard state and lands the user on Step 3, where sequence
 * generation is one click away. Everything stays editable. Pro-gated.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { chat, extractJson, isLlmConfigured, llmModel } from '@/lib/llm/client'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { checkAiAdvisorAllowed } from '@/lib/stripe/quota'
import { readSite } from '@/lib/services/site-reader'
import { GEOS } from '@/lib/types/campaign-wizard'
import { UNTRUSTED_NOTICE, delimitUntrusted, untrustedLine } from '@/lib/security/prompt-guard'
import { limitAll } from '@/lib/security/shared-rate-limit'

export const maxDuration = 60

const bodySchema = z.object({
  url: z.string().trim().min(4, 'Collez l\'adresse de votre site').max(300),
})

const VALID_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const
const VALID_GOALS = ['leads', 'demos', 'sales', 'awareness'] as const
const VALID_TONES = ['professional', 'casual', 'bold', 'consultative'] as const
const VALID_PRICING = ['', 'low', 'mid', 'high'] as const

function buildPrompt(site: { url: string; title: string; description: string; text: string }): string {
  return `Tu es un expert go-to-market B2B (20 ans, ex-VP Sales de SaaS européens).
On te donne le contenu du site web d'une entreprise. Déduis-en le setup COMPLET
d'une campagne de prospection sortante pour vendre son offre principale.

${UNTRUSTED_NOTICE}

SITE ANALYSÉ : ${untrustedLine(site.url, 300)}
TITRE : ${untrustedLine(site.title, 300)}
META DESCRIPTION : ${untrustedLine(site.description, 500)}
CONTENU (extrait) :
${delimitUntrusted(site.text, 12_000)}

TON TRAVAIL : remplis chaque champ avec rigueur :
1. campaignName : nom de campagne court et pro, format "Offre - Cible" (max 55c).
2. goal : "leads" | "demos" | "sales" | "awareness" : "demos" si l'offre se
   vend par rendez-vous (conseil, formation, SaaS cher), "leads" sinon.
3. industry : LE secteur d'acheteurs le plus prometteur (court, ex "SaaS B2B").
4. productDescription : résumé fidèle de l'offre en 2-3 phrases (ce que vend
   l'entreprise, pour qui, avec quel bénéfice). Base-toi UNIQUEMENT sur le site.
5. pricing : "low" (<100 EUR/mois) | "mid" (100-500) | "high" (>500 ou contrat)
   | "" si indevinable.
6. targetTitles : 4 à 8 intitulés LinkedIn exacts des ACHETEURS (budget +
   douleur), mélange FR/EN réaliste.
7. targetCompanySizes : 1-3 tailles parmi ["XS","S","M","L","XL"]
   (XS=1-10, S=11-50, M=51-200, L=201-1000, XL=1000+), cohérentes avec le prix.
8. targetGeos : 1-3 zones parmi : ${GEOS.join(', ')} (France par défaut si site FR).
9. tone : "professional" | "casual" | "bold" | "consultative" : "consultative"
   pour le conseil/l'expertise, "professional" par défaut.
10. valueProposition : 2-4 phrases denses qui serviront de brief au rédacteur
    IA des emails : offre, différenciateur, bénéfice chiffrable si le site en
    donne un, éléments de crédibilité RÉELS du site. Pas d'invention.
11. reasoning : 2-3 phrases en français expliquant le ciblage au fondateur.
Aucun tiret cadratin nulle part. N'invente RIEN qui ne soit pas sur le site.

FORMAT DE SORTIE : JSON STRICT, rien d'autre :
{"campaignName":"...","goal":"...","industry":"...","productDescription":"...","pricing":"...","targetTitles":["..."],"targetCompanySizes":["M"],"targetGeos":["France"],"tone":"...","valueProposition":"...","reasoning":"..."}`
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'ai.generate')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // Each call costs model tokens: per member and per workspace.
  const throttle = await limitAll([
    { key: `user:${workspace.userId}`, opts: { windowSec: 3600, max: 20, scope: 'ai-campaign-from-url' } },
    { key: `ws:${workspace.workspaceId}`, opts: { windowSec: 3600, max: 60, scope: 'ai-campaign-from-url' } },
  ])
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop de demandes à l’IA : réessayez dans une heure.' }, { status: 429 })

  if (!checkAiAdvisorAllowed(workspace.plan)) {
    return NextResponse.json(
      { error: 'La campagne express est réservée aux plans Business et Enterprise', reason: 'ai_advisor' },
      { status: 402 },
    )
  }
  if (!isLlmConfigured()) {
    return NextResponse.json({ error: 'IA non configurée côté serveur' }, { status: 503 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide' }, { status: 422 })
  }

  try {
    // 1. Read the site (guarded fetch + text extraction).
    const site = await readSite(parsed.data.url)

    // 2. One LLM call -> full campaign setup.
    const text = await chat({
      prompt:      buildPrompt(site),
      model:       llmModel('copy'),
      maxTokens:   900,
      temperature: 0.4,
      json:        true,
    })
    const raw = extractJson(text)
    if (!raw) throw new Error('Analyse IA illisible, réessayez')
    const out = JSON.parse(raw) as Record<string, unknown>

    // 3. Clamp to the wizard vocabulary: the LLM proposes, the schema disposes.
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const arr = (v: unknown) => (Array.isArray(v) ? v : [])

    const titles = arr(out.targetTitles)
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 1)
      .map((t) => t.trim().slice(0, 60)).slice(0, 8)
    const sizes = arr(out.targetCompanySizes)
      .filter((s): s is typeof VALID_SIZES[number] =>
        typeof s === 'string' && (VALID_SIZES as readonly string[]).includes(s))
      .slice(0, 3)
    // Only the zones the wizard knows: anything else came from the page.
    const geos = arr(out.targetGeos)
      .filter((g): g is string => typeof g === 'string' && (GEOS as readonly string[]).includes(g.trim()))
      .map((g) => g.trim()).slice(0, 3)

    const goal    = (VALID_GOALS as readonly string[]).includes(str(out.goal, 20)) ? str(out.goal, 20) : 'leads'
    const tone    = (VALID_TONES as readonly string[]).includes(str(out.tone, 20)) ? str(out.tone, 20) : 'professional'
    const pricing = (VALID_PRICING as readonly string[]).includes(str(out.pricing, 8)) ? str(out.pricing, 8) : ''

    if (titles.length === 0 || sizes.length === 0) {
      throw new Error('Analyse incomplète : le site ne donne pas assez de signal, complétez manuellement')
    }

    return NextResponse.json({
      ok: true,
      setup: {
        campaignName:       str(out.campaignName, 55) || 'Campagne express',
        goal,
        industry:           str(out.industry, 80),
        productDescription: str(out.productDescription, 1200),
        pricing,
        website:            site.url,
        targetTitles:       titles,
        targetCompanySizes: sizes,
        targetGeos:         geos.length > 0 ? geos : ['France'],
        tone,
        valueProposition:   str(out.valueProposition, 1200),
        reasoning:          str(out.reasoning, 600),
      },
    })
  } catch (err: unknown) {
    // The provider's or the site's error text stays in the logs.
    console.error('[campaign-from-url] FAILED:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'L’analyse n’a pas abouti : réessayez dans un instant.' }, { status: 502 })
  }
}
