/** Workspace settings shapes (apps/web/app/api/workspace/**). */

import { z } from 'zod'
import { IsoDate } from '../define'

export const CompanySizeCode = z.enum(['XS', 'S', 'M', 'L', 'XL'])

/** Fields editable from onboarding / settings (`patchSchema`, workspace/onboarding/route.ts). */
export const WorkspaceOnboardingFields = z.object({
  name: z.string(),
  targetIndustry: z.string().nullable(),
  targetCompanySize: z.string().nullable(), // column is a free string in Prisma; written only from CompanySizeCode
  sendingDomain: z.string().nullable(),
})

/** `smsSettingsInputSchema` (apps/web/lib/sms/settings.ts). */
export const SmsSettingsInput = z.object({
  enabled: z.boolean(),
  sender: z.string().trim()
    .regex(/^[A-Za-z0-9]{3,11}$/, 'Nom d’expéditeur : 3 à 11 lettres ou chiffres, sans espace ni accent.')
    .refine((s) => /[A-Za-z]/.test(s), 'Le nom d’expéditeur doit contenir au moins une lettre.')
    .refine((s) => !['INFO', 'SMS', 'NOTICE', 'ALERT', 'ALERTE', 'TEST', 'MESSAGE', 'NOREPLY', 'VERIFY'].includes(s.toUpperCase()),
      'Ce nom d’expéditeur est trop générique : utilisez le nom de votre société.'),
  /** Empty keeps the stored key. */
  apiKey: z.string().trim().max(200).optional(),
})

/** `publicSmsSettings`: never the key itself. */
export const PublicSmsSettings = z.object({
  enabled: z.boolean(),
  sender: z.string(),
  hasApiKey: z.boolean(),
})

/** `signatureSchema` (apps/web/lib/email/signature.ts), as read back. */
export const WorkspaceSignature = z.object({
  enabled: z.boolean(),
  fullName: z.string(),
  role: z.string(),
  company: z.string(),
  website: z.string(),
  linkedinUrl: z.string(),
  logoUrl: z.string(),
  whatsapp: z.string(),
  customHtml: z.string(),
})

/** Input of a save: every field optional (zod defaults), same length limits. */
export const WorkspaceSignatureInput = z.object({
  enabled: z.boolean().default(false),
  fullName: z.string().trim().max(80).default(''),
  role: z.string().trim().max(120).default(''),
  company: z.string().trim().max(120).default(''),
  website: z.string().trim().max(200).default(''),
  linkedinUrl: z.string().trim().max(300).default(''),
  logoUrl: z.string().trim().max(500).default(''),
  whatsapp: z.string().trim().max(30).default(''),
  customHtml: z.string().max(20000).default(''),
})

export const WorkspaceExportStatus = z.enum(['PENDING', 'READY', 'FAILED'])

export const WorkspaceExportItem = z.object({
  id: z.string(),
  status: WorkspaceExportStatus,
  sizeBytes: z.number().int().nullable(),
  createdAt: IsoDate,
  completedAt: IsoDate.nullable(),
  expiresAt: IsoDate,
  /** Signed download path, only for READY exports. */
  url: z.string().nullable(),
})
