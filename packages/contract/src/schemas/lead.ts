/** Lead shapes shared by several endpoints (mirror of apps/web/lib/types/lead.ts). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const CompanySize = z.enum(['XS', 'S', 'M', 'L', 'XL'])
export const LeadScoreBadge = z.enum(['FAST_TRACK', 'NORMAL', 'NURTURE', 'SKIP', 'UNSCORED'])
export const LeadStatus = z.enum(['new', 'contacted', 'qualified', 'converted', 'lost'])

/** One row of the Leads page (`toLeadRow`, apps/web/lib/leads/lead-rows.ts). */
export const LeadRow = z.object({
  id: Id,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  industry: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  website: z.string().nullable(),
  country: z.string().nullable(),
  companySize: CompanySize.nullable(),
  source: z.string(),
  apolloId: z.string().nullable(),
  aiScore: z.number().nullable(),
  scoreBadge: LeadScoreBadge,
  scoreReason: z.string().nullable(),
  status: z.string(),
  doNotContact: z.boolean().optional(),
  phone: z.string().nullable().optional(),
  createdAt: IsoDate,
  enrichment: z.object({
    emailVerified: z.boolean(),
    emailConfidence: z.number().nullable(),
    emailStatus: z.string().nullable(),
    headline: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    companyDescription: z.string().nullable().optional(),
    companyLinkedinUrl: z.string().nullable().optional(),
    technologies: z.array(z.string()).optional(),
  }).nullable(),
})
export type LeadRow = z.infer<typeof LeadRow>
