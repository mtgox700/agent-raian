/**
 * Automatic SMS settings of a workspace: its own Brevo account sends the SMS
 * steps of its sequences, so the cost and the sender belong to the client.
 *
 * B2B SMS prospecting is lawful in France without prior consent when the
 * message relates to the recipient's job, names the sender and lets them
 * object simply (CNIL). Brevo adds its STOP short code to marketing SMS,
 * keeps its own opt-out list and holds marketing SMS at night, on Sundays
 * and public holidays.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { decrypt, encrypt } from '@/lib/security/crypto'

/** Sender names operators reject as too generic. */
const GENERIC_SENDERS = new Set(['INFO', 'SMS', 'NOTICE', 'ALERT', 'ALERTE', 'TEST', 'MESSAGE', 'NOREPLY', 'VERIFY'])

export const smsSenderSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{3,11}$/, 'Nom d’expéditeur : 3 à 11 lettres ou chiffres, sans espace ni accent.')
  .refine((s) => /[A-Za-z]/.test(s), 'Le nom d’expéditeur doit contenir au moins une lettre.')
  .refine((s) => !GENERIC_SENDERS.has(s.toUpperCase()), 'Ce nom d’expéditeur est trop générique : utilisez le nom de votre société.')

export const smsSettingsInputSchema = z.object({
  enabled: z.boolean(),
  sender:  smsSenderSchema,
  /** Empty keeps the stored key. */
  apiKey:  z.string().trim().max(200).optional(),
})

const storedSchema = z.object({
  enabled:   z.boolean(),
  sender:    z.string(),
  apiKeyEnc: z.string().min(1),
})

export type StoredSmsSettings = z.infer<typeof storedSchema>

export interface ActiveSmsSettings {
  sender: string
  apiKey: string
}

export function parseStoredSmsSettings(raw: unknown): StoredSmsSettings | null {
  const parsed = storedSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** The settings to send with, or null when automatic SMS is off or unusable. */
export function activeSmsSettings(raw: unknown): ActiveSmsSettings | null {
  const stored = parseStoredSmsSettings(raw)
  if (!stored?.enabled) return null
  try {
    return { sender: stored.sender, apiKey: decrypt(stored.apiKeyEnc) }
  } catch {
    console.error('[sms] stored Brevo key cannot be decrypted')
    return null
  }
}

export function toStoredSmsSettings(input: { enabled: boolean; sender: string; apiKey: string }): StoredSmsSettings {
  return { enabled: input.enabled, sender: input.sender, apiKeyEnc: encrypt(input.apiKey) }
}

/** What the settings screen may show: never the key itself. */
export function publicSmsSettings(raw: unknown) {
  const stored = parseStoredSmsSettings(raw)
  return stored
    ? { enabled: stored.enabled, sender: stored.sender, hasApiKey: true }
    : { enabled: false, sender: '', hasApiKey: false }
}

// ─── Status webhook token ─────────────────────────────────────────────────────

function webhookSecret(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY not set')
  return Buffer.from(`brevo-sms-webhook:${key}`, 'utf8')
}

export function smsWebhookToken(workspaceId: string): string {
  return createHmac('sha256', webhookSecret()).update(workspaceId).digest('base64url')
}

export function verifySmsWebhookToken(workspaceId: string, token: string): boolean {
  const expected = Buffer.from(smsWebhookToken(workspaceId))
  const given = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function smsWebhookUrl(workspaceId: string): string | null {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.phantera-tn.com').replace(/\/+$/, '')
  if (!base.startsWith('https://')) return null
  const url = new URL(`${base}/api/webhooks/brevo-sms`)
  url.searchParams.set('w', workspaceId)
  url.searchParams.set('t', smsWebhookToken(workspaceId))
  return url.toString()
}
