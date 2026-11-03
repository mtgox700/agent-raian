/** AI helpers of the campaign wizard. */

import { z } from 'zod'
import { endpoint } from '../define'

const CompanySize = z.enum(['XS', 'S', 'M', 'L', 'XL'])

export const aiEndpoints = [
  // app/api/ai/analyze-product/route.ts
  endpoint({
    id: 'ai.analyzeProduct',
    method: 'POST',
    path: '/api/ai/analyze-product',
    summary: 'AI ICP advisor: from a product description, suggest titles, company sizes and geos.',
    auth: 'session',
    body: z.object({
      description: z.string().trim().min(30, 'Décrivez votre produit en au moins 30 caractères').max(1500),
      website: z.string().trim().max(200).optional().default(''),
      pricing: z.enum(['', 'low', 'mid', 'high']).optional().default(''),
      goal: z.string().trim().max(30).optional().default('leads'),
      industry: z.string().trim().max(120).optional().default(''),
    }),
    response: z.object({
      ok: z.literal(true),
      suggestion: z.object({
        targetTitles: z.array(z.string()),
        targetCompanySizes: z.array(CompanySize),
        targetGeos: z.array(z.string()),
        industry: z.string(),
        reasoning: z.string(),
        appliedAt: z.string(),
      }),
    }),
  }),

  // app/api/ai/campaign-from-url/route.ts
  endpoint({
    id: 'ai.campaignFromUrl',
    method: 'POST',
    path: '/api/ai/campaign-from-url',
    summary: 'Campaign in 60 seconds: derive a whole campaign setup from the homepage of a website.',
    auth: 'session',
    body: z.object({ url: z.string().trim().min(4, 'Collez l\'adresse de votre site').max(300) }),
    response: z.object({
      ok: z.literal(true),
      setup: z.object({
        campaignName: z.string(),
        goal: z.string(), // leads | demos | sales | awareness
        industry: z.string(),
        productDescription: z.string(),
        pricing: z.string(), // '' | low | mid | high
        website: z.string(),
        targetTitles: z.array(z.string()),
        targetCompanySizes: z.array(CompanySize),
        targetGeos: z.array(z.string()),
        tone: z.string(), // professional | casual | bold | consultative
        valueProposition: z.string(),
        reasoning: z.string(),
      }),
    }),
  }),

  // app/api/ai/generate-sequence/route.ts
  endpoint({
    id: 'ai.generateSequence',
    method: 'POST',
    path: '/api/ai/generate-sequence',
    summary: 'Generate a full outreach sequence, streamed as Server-Sent Events (one event per step).',
    auth: 'session',
    // TODO(contract): campaignData is the client-side CampaignWizardData (lib/types/campaign-wizard.ts); the handler does no zod validation, it only requires step3.valueProposition of 20+ chars.
    body: z.object({ campaignData: z.unknown() }),
    // Events: email_start, status, chunk, critique, email_done, invite_note_start/done/failed, sequence_done, error.
    response: z.string(),
    responseKind: 'stream',
  }),
]
