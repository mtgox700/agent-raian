/**
 * The SDK as seen from a server component of the front.
 *
 * The front reaches the back only through the API contract, also on the
 * server: the request goes to the API (same origin today, API_URL once the
 * back is deployed on its own) with the visitor's cookies, so the back
 * authenticates it exactly like a browser call.
 */

import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ApiError, createClient, type CallInput, type CallOutput, type EndpointId } from '@phantera/sdk'

async function origin(): Promise<string> {
  if (process.env.API_URL) return process.env.API_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function serverApi() {
  const h = await headers()
  const cookie = h.get('cookie') ?? ''
  return createClient({
    baseUrl: await origin(),
    fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', headers: { ...init?.headers, cookie } }),
  })
}

/**
 * Loads the data of a page. A missing session sends to sign-in, like the
 * middleware does for the page itself; any other error is thrown to the
 * error boundary.
 */
export async function loadView<I extends EndpointId>(id: I, input: CallInput<I>): Promise<CallOutput<I>> {
  const api = await serverApi()
  try {
    return await api.call(id, input)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/sign-in')
    throw err
  }
}
