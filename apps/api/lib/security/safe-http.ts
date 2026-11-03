/**
 * One HTTP(S) GET to a user-supplied URL, unable to reach the platform's own
 * network:
 * - ports 80 and 443 only (no probing of other services);
 * - the address is checked at connection time, inside the DNS lookup the
 *   socket actually uses: a name that answers public to a first check and
 *   private to the connection (DNS rebinding) is refused;
 * - no redirect followed here (the caller checks each hop);
 * - capped body, bounded time.
 */

import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { lookup as dnsLookup } from 'node:dns'
import { isIP } from 'node:net'
import { isPrivateAddress } from './private-network'

export interface SafeResponse {
  status: number
  headers: { get(name: string): string | null }
  text: string
}

const ALLOWED_PORTS = new Set(['', '80', '443'])

/** A lookup that only ever hands the socket a public address. */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)
    const list = (addresses as Array<{ address: string; family: number }>)
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error(`Host ${hostname} resolves to a non-public address`), { code: 'EPRIVATE' }), '', 0)
    }
    const chosen = list.find((a) => a.family === 4) ?? list[0]
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, [chosen])
    callback(null, chosen.address, chosen.family)
  })
}

export function assertSafeTarget(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) URLs are fetched')
  if (!ALLOWED_PORTS.has(url.port)) throw new Error('Only ports 80 and 443 are fetched')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && isPrivateAddress(host)) throw new Error('Non-public address')
}

export function safeGet(
  url: URL,
  opts: { signal: AbortSignal; headers?: Record<string, string>; maxBytes?: number },
): Promise<SafeResponse> {
  assertSafeTarget(url)
  const maxBytes = opts.maxBytes ?? 2_000_000
  const client = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = client.get(url, { headers: opts.headers, lookup: publicOnlyLookup, signal: opts.signal }, (res) => {
      const chunks: Buffer[] = []
      let size = 0
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        const headers = res.headers
        resolve({
          status:  res.statusCode ?? 0,
          headers: { get: (name: string) => { const v = headers[name.toLowerCase()]; return Array.isArray(v) ? v[0] ?? null : v ?? null } },
          text:    Buffer.concat(chunks).toString('utf8'),
        })
      }
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) { finish(); res.destroy(); return }  // enough to read: keep what came
        chunks.push(chunk)
      })
      res.on('end', finish)
      res.on('error', (err) => { if (!settled) { settled = true; reject(err) } })
    })
    req.on('error', reject)
  })
}
