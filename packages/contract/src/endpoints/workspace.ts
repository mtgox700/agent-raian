/** Workspace settings: active workspace, name, onboarding, signature, SMS, export, deletion. */

import { z } from 'zod'
import { endpoint, Id, IsoDate, Ok } from '../define'
import {
  CompanySizeCode, PublicSmsSettings, SmsSettingsInput, WorkspaceExportItem,
  WorkspaceOnboardingFields, WorkspaceSignature, WorkspaceSignatureInput,
} from '../schemas/workspace'

export const workspaceEndpoints = [
  // app/api/workspace/active/route.ts
  endpoint({
    id: 'workspace.setActive',
    method: 'POST',
    path: '/api/workspace/active',
    summary: 'Switch the active workspace (signed cookie).',
    auth: 'session',
    body: z.object({ workspaceId: z.string().min(1).max(64) }),
    response: Ok,
  }),

  // app/api/workspace/deletion/route.ts
  endpoint({
    id: 'workspace.getDeletion',
    method: 'GET',
    path: '/api/workspace/deletion',
    summary: 'Whether a deletion of the workspace is scheduled, and when.',
    auth: 'session',
    response: z.object({
      workspaceName: z.string(),
      graceDays: z.number().int(),
      requestedAt: IsoDate.nullable(),
      scheduledFor: IsoDate.nullable(),
    }),
  }),
  // app/api/workspace/deletion/route.ts
  endpoint({
    id: 'workspace.scheduleDeletion',
    method: 'POST',
    path: '/api/workspace/deletion',
    summary: 'Schedule the deletion of the workspace (owner, recent verification, name typed).',
    auth: 'stepUp',
    body: z.object({ confirmName: z.string().min(1).max(200) }),
    response: z.object({ ok: z.literal(true), scheduledFor: IsoDate, pausedCampaigns: z.number().int() }),
  }),
  // app/api/workspace/deletion/route.ts
  endpoint({
    id: 'workspace.cancelDeletion',
    method: 'DELETE',
    path: '/api/workspace/deletion',
    summary: 'Cancel a scheduled deletion within the grace period.',
    auth: 'stepUp',
    response: Ok,
  }),

  // app/api/workspace/export/[exportId]/route.ts
  endpoint({
    id: 'workspace.downloadExport',
    method: 'GET',
    path: '/api/workspace/export/[exportId]',
    summary: 'Download a ready export (application/zip). Needs the signed link (e, s) and a recent verification; redirects to settings otherwise.',
    auth: 'stepUp',
    params: z.object({ exportId: Id }),
    query: z.object({ e: z.string(), s: z.string() }),
    response: z.string().describe('application/zip binary body'),
    responseKind: 'file',
  }),

  // app/api/workspace/export/route.ts
  endpoint({
    id: 'workspace.listExports',
    method: 'GET',
    path: '/api/workspace/export',
    summary: 'Recent exports of the workspace (10 max), with a signed link for the ready ones.',
    auth: 'session',
    response: z.object({ exports: z.array(WorkspaceExportItem) }),
  }),
  // app/api/workspace/export/route.ts
  endpoint({
    id: 'workspace.requestExport',
    method: 'POST',
    path: '/api/workspace/export',
    summary: 'Ask for a full export, built in the background (one at a time, 3 per day). Answers 202.',
    auth: 'stepUp',
    response: z.object({ id: Id, status: z.literal('PENDING') }),
  }),

  // app/api/workspace/name/route.ts
  endpoint({
    id: 'workspace.rename',
    method: 'PATCH',
    path: '/api/workspace/name',
    summary: 'Rename the workspace.',
    auth: 'session',
    body: z.object({
      name: z.string().trim().min(2, 'Le nom doit faire au moins 2 caractères.').max(60, 'Le nom doit faire au plus 60 caractères.'),
    }),
    response: z.object({ ok: z.literal(true), name: z.string() }),
  }),

  // app/api/workspace/onboarding/route.ts
  endpoint({
    id: 'workspace.getOnboarding',
    method: 'GET',
    path: '/api/workspace/onboarding',
    summary: 'Onboarding status and ICP settings (null workspace when access is denied).',
    auth: 'session',
    response: z.object({
      onboardingCompleted: z.boolean(),
      workspace: WorkspaceOnboardingFields.extend({ onboardingCompleted: z.boolean() }).nullable(),
    }),
  }),
  // app/api/workspace/onboarding/route.ts
  endpoint({
    id: 'workspace.updateOnboarding',
    method: 'PATCH',
    path: '/api/workspace/onboarding',
    summary: 'Update the ICP and sending domain (only provided fields; empty domain clears it).',
    auth: 'session',
    body: z.object({
      workspaceName: z.string().min(2, 'Workspace name must be at least 2 characters').max(50).trim().optional(),
      targetIndustry: z.string().min(1).optional(),
      targetCompanySize: CompanySizeCode.optional(),
      sendingDomain: z.string()
        .regex(/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 'Invalid domain format')
        .optional()
        .or(z.literal('')),
    }),
    response: z.object({ ok: z.literal(true), workspace: WorkspaceOnboardingFields }),
  }),

  // app/api/onboarding/complete/route.ts
  endpoint({
    id: 'workspace.completeOnboarding',
    method: 'POST',
    path: '/api/onboarding/complete',
    summary: 'First-run setup: create the signed-in user\'s workspace if needed, name it and mark onboarding complete.',
    auth: 'session',
    body: z.object({
      workspaceName: z.string()
        .min(2, 'Workspace name must be at least 2 characters')
        .max(50, 'Workspace name must be 50 characters or less')
        .trim(),
      targetIndustry: z.string().min(1, 'Please select an industry').optional(),
      targetCompanySize: CompanySizeCode.optional(),
      sendingDomain: z.string()
        .regex(/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 'Please enter a valid domain (e.g. company.com)')
        .optional()
        .or(z.literal('')),
    }),
    response: z.object({ success: z.literal(true) }),
  }),

  // app/api/workspace/signature/route.ts
  endpoint({
    id: 'workspace.getSignature',
    method: 'GET',
    path: '/api/workspace/signature',
    summary: 'Pro email signature of the workspace (null when none).',
    auth: 'session',
    response: z.object({ signature: WorkspaceSignature.nullable() }),
  }),
  // app/api/workspace/signature/route.ts
  endpoint({
    id: 'workspace.saveSignature',
    method: 'PUT',
    path: '/api/workspace/signature',
    summary: 'Save the pro email signature (links must read as web addresses).',
    auth: 'session',
    body: WorkspaceSignatureInput,
    response: z.object({ ok: z.literal(true), signature: WorkspaceSignature }),
  }),

  // app/api/workspace/sms/route.ts
  endpoint({
    id: 'workspace.getSms',
    method: 'GET',
    path: '/api/workspace/sms',
    summary: 'Automatic SMS settings (Brevo) and remaining credits. The key is never returned.',
    auth: 'session',
    response: z.object({
      settings: PublicSmsSettings,
      smsCredits: z.number().nullable(),
      keyRefused: z.boolean(),
    }),
  }),
  // app/api/workspace/sms/route.ts
  endpoint({
    id: 'workspace.saveSms',
    method: 'PUT',
    path: '/api/workspace/sms',
    summary: 'Save the SMS settings. Setting a new apiKey requires a recent step-up; pausing or renaming the sender does not.',
    auth: 'stepUp',
    body: SmsSettingsInput,
    response: z.object({ ok: z.literal(true), settings: PublicSmsSettings, smsCredits: z.number().nullable() }),
  }),
  // app/api/workspace/sms/route.ts
  endpoint({
    id: 'workspace.removeSms',
    method: 'DELETE',
    path: '/api/workspace/sms',
    summary: 'Remove the Brevo key and SMS settings.',
    auth: 'stepUp',
    response: z.object({ ok: z.literal(true), settings: PublicSmsSettings }),
  }),
]
