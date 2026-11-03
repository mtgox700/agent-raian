import { z } from 'zod'

// ─── Email Address Schema ──────────────────────────────────────────────────────
const emailAddressSchema = z.object({
  id: z.string(),
  email_address: z.string().email(),
  verification: z
    .object({
      status: z.string(),
    })
    .nullable()
    .optional(),
})

// ─── User Data Schema ─────────────────────────────────────────────────────────
export const clerkUserDataSchema = z.object({
  id: z.string(),
  email_addresses: z.array(emailAddressSchema),
  primary_email_address_id: z.string().nullable(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  created_at: z.number(),
  updated_at: z.number(),
})

// ─── Webhook Event Schema ─────────────────────────────────────────────────────
export const clerkWebhookEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user.created'),
    data: clerkUserDataSchema,
  }),
  z.object({
    type: z.literal('user.updated'),
    data: clerkUserDataSchema,
  }),
  z.object({
    type: z.literal('user.deleted'),
    data: z.object({
      id: z.string(),
      deleted: z.boolean().optional(),
    }),
  }),
])

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type ClerkUserData = z.infer<typeof clerkUserDataSchema>
export type ClerkWebhookEvent = z.infer<typeof clerkWebhookEventSchema>

// ─── Helper ───────────────────────────────────────────────────────────────────
export function getPrimaryEmail(userData: ClerkUserData): string | null {
  if (!userData.primary_email_address_id) return null
  const primary = userData.email_addresses.find(
    (e) => e.id === userData.primary_email_address_id
  )
  return primary?.email_address ?? null
}

export function getFullName(userData: ClerkUserData): string | null {
  const first = userData.first_name ?? ''
  const last = userData.last_name ?? ''
  const full = `${first} ${last}`.trim()
  return full.length > 0 ? full : null
}
