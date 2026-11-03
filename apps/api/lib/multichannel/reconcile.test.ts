import { describe, expect, it } from 'vitest'
import { pickClaimableAccount } from './reconcile'

const attempt = { provider: 'LINKEDIN', createdAt: new Date('2026-10-06T10:00:00Z') }
const account = (id: string, createdAt: string | null, type = 'LINKEDIN') =>
  ({ id, type, name: 'X', createdAt: createdAt ? new Date(createdAt) : null })

describe('pickClaimableAccount', () => {
  it('claims the single account created during the attempt', () => {
    expect(pickClaimableAccount(attempt, [account('a1', '2026-10-06T10:03:00Z')], 0)?.id).toBe('a1')
  })

  it('never claims when another workspace is connecting at the same time', () => {
    expect(pickClaimableAccount(attempt, [account('a1', '2026-10-06T10:03:00Z')], 1)).toBeNull()
  })

  it('never claims an account created before the attempt (someone else\'s)', () => {
    expect(pickClaimableAccount(attempt, [account('old', '2026-10-05T09:00:00Z')], 0)).toBeNull()
  })

  it('never claims when several accounts could match', () => {
    const accounts = [account('a1', '2026-10-06T10:03:00Z'), account('a2', '2026-10-06T10:20:00Z')]
    expect(pickClaimableAccount(attempt, accounts, 0)).toBeNull()
  })

  it('ignores accounts of another type and accounts without a creation date', () => {
    const accounts = [account('w', '2026-10-06T10:03:00Z', 'WHATSAPP'), account('n', null)]
    expect(pickClaimableAccount(attempt, accounts, 0)).toBeNull()
  })
})
