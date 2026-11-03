/**
 * Building blocks of the API contract.
 *
 * One `endpoint()` per method and path. The contract is the only thing a
 * front may rely on: the back implements it (checked by
 * apps/web/lib/contract/contract.test.ts), the SDK and openapi.json are
 * derived from it.
 */

import { z } from 'zod'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * - `session`: Clerk session cookie required (JSON 401 otherwise).
 * - `stepUp`:  session + a recent re-authentication (call through stepUpFetch).
 * - `public`:  no session.
 */
export type Auth = 'session' | 'stepUp' | 'public'

/** How the body of a successful answer is read. */
export type ResponseKind = 'json' | 'stream' | 'redirect' | 'file'

export interface EndpointDef<
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType,
  R extends z.ZodType = z.ZodType,
> {
  /** Stable identifier, `domain.action` (e.g. `leads.updateStatus`). The SDK is keyed by it. */
  id: string
  method: HttpMethod
  /** Next.js style path: `/api/leads/[leadId]/status`. */
  path: string
  summary: string
  auth: Auth
  params?: P
  query?: Q
  body?: B
  /** Schema of a successful (2xx) JSON answer. Errors always follow `ErrorBody`. */
  response: R
  responseKind?: ResponseKind
  tags?: string[]
}

export function endpoint<const D extends EndpointDef>(def: D): D {
  return def
}

/** Every error answer of the API: `{ error: string }`, sometimes with a machine code. */
export const ErrorBody = z.object({
  error: z.string(),
  code: z.string().optional(),
})
export type ErrorBody = z.infer<typeof ErrorBody>

/** `{ ok: true }` acknowledgement used by many mutations. */
export const Ok = z.object({ ok: z.literal(true) })

/** Identifiers are opaque strings (cuid). */
export const Id = z.string().min(1)

/** ISO-8601 date as it travels in JSON. */
export const IsoDate = z.string()
