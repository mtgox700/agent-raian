/**
 * @phantera/sdk: typed client for the Phantera API.
 *
 * Everything is derived from @phantera/contract: adding an endpoint to the
 * contract adds it here, with its types, without touching this file.
 *
 *   const api = createClient({ stepUpFetch })
 *   const { data } = await api.call('leads.list', { query: { workspaceId } })
 *   await api.call('leads.updateStatus', { params: { leadId }, body: { status: 'qualified' } })
 *   <a href={api.url('auth.gmailStart', { query: { workspaceId } })}>
 */

import { z } from 'zod'
import { endpoints, type EndpointDef, type EndpointId, type Endpoints, type ErrorBody } from '@phantera/contract'

type ById<I extends EndpointId> = Extract<Endpoints[number], { id: I }>

type Part<K extends string, S> = S extends z.ZodNever | undefined
  ? { [P in K]?: never }
  : S extends z.ZodType
    ? (undefined extends z.input<S> ? { [P in K]?: z.input<S> } : { [P in K]: z.input<S> })
    : { [P in K]?: never }

/** What a call needs: path params, query string and body, each only when the endpoint has one. */
export type CallInput<I extends EndpointId> = ById<I> extends EndpointDef<infer P, infer Q, infer B, z.ZodType>
  ? Part<'params', P> & Part<'query', Q> & Part<'body', B>
  : never

/** What a successful call returns: parsed JSON, or the raw Response for streams, files and redirects. */
export type CallOutput<I extends EndpointId> = ById<I> extends { responseKind: 'stream' | 'file' | 'redirect' }
  ? Response
  : ById<I> extends EndpointDef<z.ZodType, z.ZodType, z.ZodType, infer R> ? z.output<R> : never

export class ApiError extends Error {
  constructor(
    readonly endpoint: EndpointId,
    readonly status: number,
    readonly body: ErrorBody | null,
  ) {
    super(body?.error ?? `${endpoint} failed with HTTP ${status}`)
    this.name = 'ApiError'
  }
}

export interface ClientOptions {
  /** API origin. Empty (default) = same origin as the page. */
  baseUrl?: string
  fetch?: typeof fetch
  /** Used for `stepUp` endpoints (the front's stepUpFetch re-authenticates and retries). */
  stepUpFetch?: typeof fetch
  /**
   * Check every JSON answer against the contract. Default: on outside production.
   * A mismatch never breaks the call: it is reported to `onContractMismatch`.
   */
  validateResponses?: boolean
  onContractMismatch?: (id: EndpointId, issues: z.core.$ZodIssue[]) => void
}

const byId = new Map<string, EndpointDef>((endpoints as readonly EndpointDef[]).map((e) => [e.id, e]))

function definition(id: string): EndpointDef {
  const def = byId.get(id)
  if (!def) throw new Error(`Unknown endpoint: ${id}`)
  return def
}

function buildPath(def: EndpointDef, params: Record<string, unknown> | undefined): string {
  return def.path.replace(/\[([^\]]+)\]/g, (_, name: string) => {
    const value = params?.[name]
    if (value === undefined || value === null || value === '') throw new Error(`${def.id}: missing path param "${name}"`)
    return encodeURIComponent(String(value))
  })
}

function buildQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    for (const v of Array.isArray(value) ? value : [value]) search.append(key, String(v))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

export function createClient(options: ClientOptions = {}) {
  const baseUrl = options.baseUrl ?? ''
  const plainFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const validate = options.validateResponses ?? process.env.NODE_ENV !== 'production'
  const onMismatch = options.onContractMismatch
    ?? ((id, issues) => console.warn(`[contract] ${id}: answer does not match the contract`, issues))

  function url<I extends EndpointId>(id: I, input: CallInput<I>): string {
    const def = definition(id)
    const { params, query } = input as { params?: Record<string, unknown>; query?: Record<string, unknown> }
    if (def.params) def.params.parse(params)
    if (def.query) def.query.parse(query ?? {})
    return `${baseUrl}${buildPath(def, params)}${buildQuery(query)}`
  }

  async function call<I extends EndpointId>(id: I, input: CallInput<I>, init: RequestInit = {}): Promise<CallOutput<I>> {
    const def = definition(id)
    const { body } = input as { body?: unknown }
    if (def.body) def.body.parse(body)

    const doFetch = def.auth === 'stepUp' && options.stepUpFetch ? options.stepUpFetch : plainFetch
    const res = await doFetch(url(id, input), {
      ...init,
      method: def.method,
      credentials: init.credentials ?? 'same-origin',
      headers: { ...(def.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      ...(def.body ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      let errorBody: ErrorBody | null = null
      try { errorBody = (await res.json()) as ErrorBody } catch { /* not JSON */ }
      throw new ApiError(id, res.status, errorBody)
    }
    if ((def.responseKind ?? 'json') !== 'json') return res as CallOutput<I>

    const data: unknown = await res.json()
    if (validate) {
      const checked = def.response.safeParse(data)
      if (!checked.success) onMismatch(id, checked.error.issues)
    }
    return data as CallOutput<I>
  }

  return { call, url }
}

export type ApiClient = ReturnType<typeof createClient>
export { endpoints }
export type { EndpointId }
