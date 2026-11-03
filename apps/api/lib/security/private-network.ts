/**
 * Guards outbound connections to user-supplied hosts (SMTP/IMAP servers, site
 * URLs) against reaching the platform's own network: loopback, private ranges,
 * link-local (cloud metadata) and other non-routable addresses.
 *
 * The check runs on the resolved IPs, not on the host name, so a public name
 * pointing to 127.0.0.1 or 10.x is rejected too.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToInt(ip)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (value & mask) === (ipv4ToInt(base) & mask)
  })
}

/** The 8 hextets of an IPv6 address (with "::" expanded and a dotted IPv4 tail converted). */
function ipv6Hextets(ip: string): number[] | null {
  let v = ip.toLowerCase().split('%')[0]
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(v)
  if (dotted) {
    const n = ipv4ToInt(dotted[1])
    v = v.slice(0, -dotted[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const [head, tail, extra] = v.split('::')
  if (extra !== undefined) return null
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  if (tail === undefined ? left.length !== 8 : missing < 0) return null
  const parts = [...left, ...Array(tail === undefined ? 0 : missing).fill('0'), ...right]
  const hextets = parts.map((h) => parseInt(h, 16))
  return hextets.length === 8 && hextets.every((h) => Number.isInteger(h) && h >= 0 && h <= 0xffff) ? hextets : null
}

const v4From = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`

/**
 * Private, reserved, or wrapping an IPv4 address that is: mapped
 * (::ffff:0:0/96), compatible (::/96), NAT64 (64:ff9b::/96) and 6to4
 * (2002::/16) addresses are judged on the IPv4 address they carry, so
 * "::ffff:7f00:1" is loopback like 127.0.0.1.
 */
function isPrivateV6(ip: string): boolean {
  const h = ipv6Hextets(ip)
  if (!h) return true
  const zeros = (from: number, to: number) => h.slice(from, to).every((x) => x === 0)
  if (zeros(0, 8) || (zeros(0, 7) && h[7] === 1)) return true                       // :: and ::1
  if (zeros(0, 5) && h[5] === 0xffff) return isPrivateV4(v4From(h[6], h[7]))        // mapped
  if (zeros(0, 6)) return isPrivateV4(v4From(h[6], h[7]))                           // compatible
  if (h[0] === 0x64 && h[1] === 0xff9b && zeros(2, 6)) return isPrivateV4(v4From(h[6], h[7])) // NAT64
  if (h[0] === 0x2002) return isPrivateV4(v4From(h[1], h[2]))                       // 6to4
  if ((h[0] & 0xfe00) === 0xfc00) return true                                      // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return true       // link-local, site-local
  if ((h[0] & 0xff00) === 0xff00) return true                                      // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true                              // documentation
  if (h[0] === 0x0100 && zeros(1, 4)) return true                                   // discard 100::/64
  return false
}

/** True when the literal IP must never be the target of an outbound call. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isPrivateV4(ip)
  if (family === 6) return isPrivateV6(ip)
  return true
}

/**
 * Resolves `host` and throws when any of its addresses is private. Returns a
 * public address (IPv4 when there is one) so the caller connects to exactly
 * what was checked.
 */
export async function resolvePublicHost(
  host: string,
  resolve: (h: string) => Promise<Array<{ address: string }>> = (h) => lookup(h, { all: true }),
): Promise<string> {
  const addresses = isIP(host) ? [{ address: host }] : await resolve(host)
  if (addresses.length === 0) throw new Error(`Host ${host} does not resolve`)
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`Host ${host} resolves to a non-public address`)
  }
  // IPv4 first: serverless egress often has no IPv6 route, and the caller
  // connects to this one address.
  return (addresses.find((a) => isIP(a.address) === 4) ?? addresses[0]).address
}
