import { describe, expect, it } from 'vitest'
import { isStrictCspPath, newNonce, staticCsp, strictCsp } from './csp'

const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.startsWith(`${name} `) || d === name)?.split(' ').slice(1) ?? null

describe('strict policy (signed-in surfaces)', () => {
  const policy = strictCsp('abc123==')

  it('runs only scripts carrying the nonce, and what they load', () => {
    const scripts = directive(policy, 'script-src')!
    expect(scripts).toContain("'nonce-abc123=='")
    expect(scripts).toContain("'strict-dynamic'")
    expect(scripts).not.toContain("'unsafe-inline'")
    expect(scripts).not.toContain("'unsafe-eval'")
  })

  it('no plugins, no framing, no <base> hijack, forms to us and Clerk only', () => {
    expect(directive(policy, 'object-src')).toEqual(["'none'"])
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(policy, 'base-uri')).toEqual(["'self'"])
    expect(directive(policy, 'form-action')).toContain("'self'")
  })

  it('lets data out only to the hosts the browser really talks to', () => {
    const connect = directive(policy, 'connect-src')!
    expect(connect).not.toContain('https:')
    expect(connect).not.toContain('wss:')
    expect(connect).toEqual(expect.arrayContaining(["'self'", 'https://clerk.phantera-tn.com', 'https://eu.i.posthog.com']))
  })

  it('allows eval only in development (React refresh)', () => {
    expect(directive(strictCsp('n', { dev: true }), 'script-src')).toContain("'unsafe-eval'")
  })
})

describe('static policy (prerendered public pages)', () => {
  const policy = staticCsp()
  it('loads Clerk and Turnstile: /sign-in is reached from public pages by client-side navigation', () => {
    const scripts = directive(policy, 'script-src')!
    expect(scripts).toContain('https://clerk.phantera-tn.com')
    expect(scripts).toContain('https://challenges.cloudflare.com')
  })

  it('keeps inline bootstrap scripts but never eval, and the same hardening', () => {
    const scripts = directive(policy, 'script-src')!
    expect(scripts).toContain("'unsafe-inline'")
    expect(scripts).not.toContain("'unsafe-eval'")
    expect(directive(policy, 'object-src')).toEqual(["'none'"])
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"])
  })
})

describe('nonce and routing', () => {
  it('a fresh 128-bit nonce per request', () => {
    const a = newNonce()
    expect(a).not.toBe(newNonce())
    expect(Buffer.from(a, 'base64')).toHaveLength(16)
  })

  it('signed-in surfaces get the strict policy, public pages the static one', () => {
    for (const p of ['/dashboard', '/dashboard/settings', '/onboarding', '/invite/abc', '/sign-in', '/sign-up/verify']) expect(isStrictCspPath(p)).toBe(true)
    for (const p of ['/', '/blog', '/blog/x', '/about', '/legal/privacy', '/dashboards-are-cool', '/api/health']) expect(isStrictCspPath(p)).toBe(false)
    expect(isStrictCspPath('/%64ashboard/settings')).toBe(true)
    expect(isStrictCspPath('/%E0%A4%A')).toBe(false)
  })
})
