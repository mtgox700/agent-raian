import { describe, expect, it, vi } from 'vitest'
import { auditRetentionCutoff, purgeAuditEvents, recordAudit, summarizeUserAgent, truncateIp } from './audit'
import { AUDIT_ACTIONS, auditLabel } from './actions'

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const EDGE_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0'

function fakeDb(email: string | null = 'ayoub@example.com') {
  return {
    user:       { findUnique: vi.fn().mockResolvedValue(email ? { email } : null) },
    auditEvent: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
  }
}

describe('privacy of the trail', () => {
  it('keeps the network of an address, not the address', () => {
    expect(truncateIp('203.0.113.77')).toBe('203.0.113.0/24')
    expect(truncateIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::/48')
    expect(truncateIp('2001:db8::1')).toBe('2001:db8:0::/48')
    expect(truncateIp('unknown')).toBeNull()
    expect(truncateIp(null)).toBeNull()
  })

  it('summarises the browser instead of storing the raw header', () => {
    expect(summarizeUserAgent(CHROME_WIN)).toBe('Chrome · Windows')
    expect(summarizeUserAgent(SAFARI_IOS)).toBe('Safari · iOS')
    expect(summarizeUserAgent(EDGE_MAC)).toBe('Edge · macOS')
    expect(summarizeUserAgent('curl/8.0')).toBe('Autre navigateur · autre système')
    expect(summarizeUserAgent(null)).toBeNull()
  })
})

describe('recordAudit', () => {
  const req = new Request('https://www.phantera-tn.com/api/x', { headers: { 'x-real-ip': '198.51.100.9', 'user-agent': CHROME_WIN } })

  it('writes who, what, on what, from which network', async () => {
    const db = fakeDb()
    await recordAudit(db as never, { workspaceId: 'ws1', userId: 'u1' }, {
      action: 'member.role_changed', target: { type: 'user', id: 'u2' }, req, details: { from: 'MEMBER', to: 'ADMIN' },
    })
    expect(db.auditEvent.create).toHaveBeenCalledWith({ data: {
      workspaceId: 'ws1', actorUserId: 'u1', actorLabel: 'ayoub@example.com', action: 'member.role_changed',
      targetType: 'user', targetId: 'u2', ipPrefix: '198.51.100.0/24', userAgent: 'Chrome · Windows',
      result: 'SUCCESS', details: { from: 'MEMBER', to: 'ADMIN' },
    } })
  })

  it('names the system when there is no actor (Stripe, scheduler)', async () => {
    const db = fakeDb()
    await recordAudit(db as never, { workspaceId: 'ws1', userId: null }, { action: 'plan.changed' })
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.auditEvent.create.mock.calls[0][0].data).toMatchObject({ actorUserId: null, actorLabel: 'Système', ipPrefix: null })
  })

  it('never fails the action it records', async () => {
    const db = fakeDb()
    db.auditEvent.create.mockRejectedValue(new Error('db down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordAudit(db as never, { workspaceId: 'ws1', userId: 'u1' }, { action: 'data.exported' })).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('retention', () => {
  it('purges only what is older than 13 months (and a day of margin)', async () => {
    const db = fakeDb()
    expect(await purgeAuditEvents(db as never, new Date('2027-12-15T12:00:00Z'))).toBe(3)
    expect(db.auditEvent.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date('2026-11-14T12:00:00Z') } } })
  })
})

describe('retention cutoff', () => {
  it('clamps the day like Postgres, so the purge never targets protected rows', () => {
    expect(auditRetentionCutoff(new Date('2027-03-31T10:00:00Z')).toISOString()).toBe('2026-02-27T10:00:00.000Z')
    expect(auditRetentionCutoff(new Date('2028-03-31T10:00:00Z')).toISOString()).toBe('2027-02-27T10:00:00.000Z')
    expect(auditRetentionCutoff(new Date('2027-01-01T00:00:00Z')).toISOString()).toBe('2025-11-30T00:00:00.000Z')
  })
})

describe('labels', () => {
  it('every action has a French label', () => {
    for (const [action, label] of Object.entries(AUDIT_ACTIONS)) {
      expect(label.length).toBeGreaterThan(3)
      expect(auditLabel(action)).toBe(label)
    }
    expect(auditLabel('unknown.action')).toBe('unknown.action')
  })
})
