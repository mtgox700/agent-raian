/**
 * POST /api/ai/analyze-product: AI ICP advisor (campaign wizard, Step 1).
 *
 * The user describes WHAT they sell; the LLM returns WHO to target, constrained
 * to the wizard's own vocabulary (CompanySize enum, known geos) so the values
 * drop straight into Step 2's fields. Pro-gated like sequence generation.
 *
 * Body:   { description, website?, pricing?, goal, industry? }
 * Result: { targetTitles[], targetCompanySizes[], targetGeos[], industry, reasoning }
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { chat, extractJson, isLlmConfigured, llmModel } from '@/lib/llm/client'
import { accessDenied, requireAccess } from '@/lib/auth/access'
import { checkAiAdvisorAllowed } from '@/lib/stripe/quota'
import { GEOS } from '@/lib/types/campaign-wizard'
import { UNTRUSTED_NOTICE, delimitUntrusted } from '@/lib/security/prompt-guard'
import { limitAll } from '@/lib/security/shared-rate-limit'

export const maxDuration = 60

const bodySchema = z.object({
  description: z.string().trim().min(30, 'Décrivez votre produit en au moins 30 caractères').max(1500),
  website:     z.string().trim().max(200).optional().default(''),
  pricing:     z.enum(['', 'low', 'mid', 'high']).optional().default(''),
  goal:        z.string().trim().max(30).optional().default('leads'),
  industry:    z.string().trim().max(120).optional().default(''),
})

const VALID_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const
type Size = typeof VALID_SIZES[number]

const PRICING_LABEL: Record<string, string> = {
  low:  'moins de 100 EUR/mois (self-serve, décision rapide)',
  mid:  '100 à 500 EUR/mois (décideur métier, cycle court)',
  high: 'plus de 500 EUR/mois ou contrat annuel (cycle de vente long, comité)',
}

function buildPrompt(input: z.infer<typeof bodySchema>): string {
  return `Tu es un expert en go-to-market B2B avec 20 ans d'expérience (ex-VP Sales
de plusieurs SaaS ayant scalé en Europe). Un fondateur décrit son produit ;
ton travail : déterminer le ciblage de prospection le PLUS rentable.

PRODUIT DÉCRIT PAR LE FONDATEUR :
${UNTRUSTED_NOTICE}
${delimitUntrusted(input.description, 1500)}
${input.website ? `Site web : ${input.website}` : ''}
${input.pricing && PRICING_LABEL[input.pricing] ? `Niveau de prix : ${PRICING_LABEL[input.pricing]}` : ''}
${input.industry ? `Secteur pressenti par le fondateur : ${input.industry}` : ''}
Objectif de campagne : ${input.goal}

RÈGLES DE RAISONNEMENT :
1. Cible les personnes qui possèdent le BUDGET et la DOULEUR, pas les
   utilisateurs finaux. Un prix élevé impose des décideurs seniors.
2. targetCompanySizes : sous-ensemble STRICT de ["XS","S","M","L","XL"]
   (XS=1-10, S=11-50, M=51-200, L=201-1000, XL=1000+). Choisis 1 à 3 tailles
   où le ratio budget/accessibilité est optimal : jamais les 5.
3. targetTitles : 4 à 8 intitulés de poste EXACTS tels qu'on les trouve sur
   LinkedIn (mélange FR/EN réaliste, ex: "CEO", "Directeur Commercial",
   "Head of Sales"). Pas de catégories vagues.
4. targetGeos : 1 à 3 zones parmi : ${GEOS.join(', ')} (défaut France si le
   produit est en français).
5. industry : LE secteur d'acheteurs le plus prometteur (court, ex: "SaaS B2B").
6. reasoning : 2-3 phrases en français expliquant le choix au fondateur,
   ton direct de conseiller senior. Pas de tiret cadratin.

FORMAT DE SORTIE : JSON STRICT, rien d'autre :
{"targetTitles":["..."],"targetCompanySizes":["M","L"],"targetGeos":["France"],"industry":"...","reasoning":"..."}`
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const workspaceAccess = await requireAccess(userId, 'ai.generate')
  if (!workspaceAccess.ok) return accessDenied(workspaceAccess)
  const workspace = workspaceAccess.ctx

  // Each call costs model tokens: per member and per workspace.
  const throttle = await limitAll([
    { key: `user:${workspace.userId}`, opts: { windowSec: 3600, max: 30, scope: 'ai-analyze-product' } },
    { key: `ws:${workspace.workspaceId}`, opts: { windowSec: 3600, max: 90, scope: 'ai-analyze-product' } },
  ])
  if (!throttle.allowed) return NextResponse.json({ error: 'Trop de demandes à l’IA : réessayez dans une heure.' }, { status: 429 })

  if (!checkAiAdvisorAllowed(workspace.plan)) {
    return NextResponse.json(
      { error: 'La recommandation IA du ciblage est réservée aux plans Business et Enterprise', reason: 'ai_advisor' },
      { status: 402 },
    )
  }

  if (!isLlmConfigured()) {
    return NextResponse.json({ error: 'IA non configurée côté serveur' }, { status: 503 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Requête invalide' },
      { status: 422 },
    )
  }

  try {
    const text = await chat({
      prompt:      buildPrompt(parsed.data),
      model:       llmModel('copy'),
      maxTokens:   500,
      temperature: 0.4,
      json:        true,
    })

    const raw = extractJson(text)
    if (!raw) throw new Error('Réponse IA illisible')
    const out = JSON.parse(raw) as {
      targetTitles?: unknown
      targetCompanySizes?: unknown
      targetGeos?: unknown
      industry?: unknown
      reasoning?: unknown
    }

    // Clamp everything to the wizard's vocabulary: the LLM proposes, the
    // schema disposes. Bad values are dropped, never forwarded to the UI.
    const titles = (Array.isArray(out.targetTitles) ? out.targetTitles : [])
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 1)
      .map((t) => t.trim().slice(0, 60))
      .slice(0, 8)
    const sizes = (Array.isArray(out.targetCompanySizes) ? out.targetCompanySizes : [])
      .filter((s): s is Size => typeof s === 'string' && (VALID_SIZES as readonly string[]).includes(s))
      .slice(0, 3)
    const geos = (Array.isArray(out.targetGeos) ? out.targetGeos : [])
      .filter((g): g is string => typeof g === 'string' && (GEOS as readonly string[]).includes(g.trim()))
      .map((g) => g.trim())
      .slice(0, 3)
    const industry  = typeof out.industry === 'string' ? out.industry.trim().slice(0, 80) : ''
    const reasoning = typeof out.reasoning === 'string' ? out.reasoning.trim().slice(0, 600) : ''

    if (titles.length === 0 || sizes.length === 0) {
      throw new Error('Analyse incomplète, réessayez avec une description plus précise')
    }

    return NextResponse.json({
      ok: true,
      suggestion: {
        targetTitles:       titles,
        targetCompanySizes: sizes,
        targetGeos:         geos.length > 0 ? geos : ['France'],
        industry,
        reasoning,
        appliedAt: new Date().toISOString(),
      },
    })
  } catch (err: unknown) {
    console.error('[analyze-product] FAILED:', err instanceof Error ? err.message : String(err))
    const message = err instanceof Error && err.message.startsWith('Analyse incomplète') ? err.message : 'L’analyse n’a pas abouti : réessayez dans un instant.'
    console.error('[analyze-product] FAILED:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
