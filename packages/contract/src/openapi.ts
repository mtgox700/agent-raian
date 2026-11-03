/** Turns the contract into an OpenAPI 3.1 document (JSON Schema from zod 4). */

import { z } from 'zod'
import { ErrorBody, type EndpointDef } from './define'
import { endpoints } from './index'

type Json = Record<string, unknown>

function schema(s: z.ZodType, io: 'input' | 'output'): Json {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(s, { io, unrepresentable: 'any' }) as Json
  return rest
}

/** `/api/leads/[leadId]/status` → `/api/leads/{leadId}/status` */
export function toOpenApiPath(path: string): string {
  return path.replace(/\[([^\]]+)\]/g, '{$1}')
}

function objectParameters(s: z.ZodType | undefined, where: 'path' | 'query'): Json[] {
  if (!s) return []
  const json = schema(s, 'input') as { properties?: Record<string, Json>; required?: string[] }
  return Object.entries(json.properties ?? {}).map(([name, prop]) => ({
    name,
    in: where,
    required: where === 'path' || (json.required ?? []).includes(name),
    schema: prop,
  }))
}

const CONTENT_TYPE: Record<string, string> = {
  json: 'application/json',
  stream: 'text/event-stream',
  file: 'application/octet-stream',
}

function operation(e: EndpointDef): Json {
  const kind = e.responseKind ?? 'json'
  const success = kind === 'redirect'
    ? { '302': { description: 'Redirect' } }
    : { '200': { description: 'Success', content: { [CONTENT_TYPE[kind]]: { schema: schema(e.response, 'output') } } } }
  const error = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } } }

  return {
    operationId: e.id,
    summary: e.summary,
    tags: e.tags ?? [e.id.split('.')[0]],
    security: e.auth === 'public' ? [] : [{ clerkSession: [] }],
    ...(e.auth === 'stepUp' ? { 'x-step-up': true } : {}),
    parameters: [...objectParameters(e.params, 'path'), ...objectParameters(e.query, 'query')],
    ...(e.body
      ? { requestBody: { required: true, content: { 'application/json': { schema: schema(e.body, 'input') } } } }
      : {}),
    responses: { ...success, '400': error, '401': error, '403': error, '404': error, '500': error },
  }
}

export function buildOpenApi(): Json {
  const paths: Record<string, Record<string, Json>> = {}
  const sorted = [...(endpoints as readonly EndpointDef[])].sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path))
  for (const e of sorted) {
    const p = toOpenApiPath(e.path)
    paths[p] ??= {}
    paths[p][e.method.toLowerCase()] = operation(e)
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Phantera API',
      version: '1.0.0',
      description: 'Contract between the Phantera back and its fronts. Generated from @phantera/contract: do not edit.',
    },
    paths,
    components: {
      schemas: { ErrorBody: schema(ErrorBody, 'output') },
      securitySchemes: {
        clerkSession: { type: 'apiKey', in: 'cookie', name: '__session', description: 'Clerk session cookie' },
      },
    },
  }
}
