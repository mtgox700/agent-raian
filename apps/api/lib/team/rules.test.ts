import { describe, expect, it } from 'vitest'
import { canChangeRole, canInvite, canReceiveTransfer, canRemove } from './rules'
import { hashInvitationToken, invitationUrl, newInvitationToken } from './invitation-link'

const ok = { ok: true }
const refused = (refusal: string) => ({ ok: false, refusal })

describe('inviting', () => {
  it('owners invite admins, members and viewers; never an owner', () => {
    expect(canInvite('OWNER', 'ADMIN')).toEqual(ok)
    expect(canInvite('OWNER', 'MEMBER')).toEqual(ok)
    expect(canInvite('OWNER', 'VIEWER')).toEqual(ok)
    expect(canInvite('OWNER', 'OWNER')).toEqual(refused('INVALID_ROLE'))
  })

  it('an admin invites members and viewers, not another admin', () => {
    expect(canInvite('ADMIN', 'MEMBER')).toEqual(ok)
    expect(canInvite('ADMIN', 'VIEWER')).toEqual(ok)
    expect(canInvite('ADMIN', 'ADMIN')).toEqual(refused('NOT_ALLOWED'))
  })

  it('members and viewers invite nobody', () => {
    expect(canInvite('MEMBER', 'MEMBER')).toEqual(refused('NOT_ALLOWED'))
    expect(canInvite('VIEWER', 'VIEWER')).toEqual(refused('NOT_ALLOWED'))
  })
})

describe('changing a role', () => {
  it('only an owner grants or takes owner and admin', () => {
    expect(canChangeRole({ actor: 'OWNER', target: 'MEMBER', next: 'ADMIN', owners: 1 })).toEqual(ok)
    expect(canChangeRole({ actor: 'OWNER', target: 'ADMIN', next: 'MEMBER', owners: 1 })).toEqual(ok)
    expect(canChangeRole({ actor: 'ADMIN', target: 'MEMBER', next: 'ADMIN', owners: 1 })).toEqual(refused('NOT_ALLOWED'))
    expect(canChangeRole({ actor: 'ADMIN', target: 'MEMBER', next: 'OWNER', owners: 1 })).toEqual(refused('NOT_ALLOWED'))
    expect(canChangeRole({ actor: 'ADMIN', target: 'ADMIN', next: 'MEMBER', owners: 1 })).toEqual(refused('NOT_ALLOWED'))
    expect(canChangeRole({ actor: 'ADMIN', target: 'OWNER', next: 'MEMBER', owners: 2 })).toEqual(refused('NOT_ALLOWED'))
  })

  it('an admin moves members and viewers between them', () => {
    expect(canChangeRole({ actor: 'ADMIN', target: 'MEMBER', next: 'VIEWER', owners: 1 })).toEqual(ok)
    expect(canChangeRole({ actor: 'ADMIN', target: 'VIEWER', next: 'MEMBER', owners: 1 })).toEqual(ok)
  })

  it('the last owner cannot be demoted, even by themselves; with two, one can', () => {
    expect(canChangeRole({ actor: 'OWNER', target: 'OWNER', next: 'ADMIN', owners: 1 })).toEqual(refused('LAST_OWNER'))
    expect(canChangeRole({ actor: 'OWNER', target: 'OWNER', next: 'ADMIN', owners: 2 })).toEqual(ok)
  })

  it('members and viewers change nothing', () => {
    expect(canChangeRole({ actor: 'MEMBER', target: 'VIEWER', next: 'MEMBER', owners: 1 })).toEqual(refused('NOT_ALLOWED'))
    expect(canChangeRole({ actor: 'VIEWER', target: 'MEMBER', next: 'VIEWER', owners: 1 })).toEqual(refused('NOT_ALLOWED'))
  })
})

describe('removing and leaving', () => {
  it('anyone may leave, except the last owner', () => {
    expect(canRemove({ actor: 'VIEWER', actorIsTarget: true, target: 'VIEWER', owners: 1 })).toEqual(ok)
    expect(canRemove({ actor: 'MEMBER', actorIsTarget: true, target: 'MEMBER', owners: 1 })).toEqual(ok)
    expect(canRemove({ actor: 'OWNER', actorIsTarget: true, target: 'OWNER', owners: 1 })).toEqual(refused('LAST_OWNER'))
    expect(canRemove({ actor: 'OWNER', actorIsTarget: true, target: 'OWNER', owners: 2 })).toEqual(ok)
  })

  it('an admin removes members and viewers, not admins nor owners', () => {
    expect(canRemove({ actor: 'ADMIN', actorIsTarget: false, target: 'MEMBER', owners: 1 })).toEqual(ok)
    expect(canRemove({ actor: 'ADMIN', actorIsTarget: false, target: 'ADMIN', owners: 1 })).toEqual(refused('NOT_ALLOWED'))
    expect(canRemove({ actor: 'ADMIN', actorIsTarget: false, target: 'OWNER', owners: 2 })).toEqual(refused('NOT_ALLOWED'))
  })

  it('an owner removes anyone but the last owner; a member removes nobody else', () => {
    expect(canRemove({ actor: 'OWNER', actorIsTarget: false, target: 'ADMIN', owners: 1 })).toEqual(ok)
    expect(canRemove({ actor: 'OWNER', actorIsTarget: false, target: 'OWNER', owners: 2 })).toEqual(ok)
    expect(canRemove({ actor: 'MEMBER', actorIsTarget: false, target: 'VIEWER', owners: 1 })).toEqual(refused('NOT_ALLOWED'))
  })

  it('only owners and admins take over a leaving member’s work', () => {
    expect(canReceiveTransfer('OWNER')).toBe(true)
    expect(canReceiveTransfer('ADMIN')).toBe(true)
    expect(canReceiveTransfer('MEMBER')).toBe(false)
    expect(canReceiveTransfer('VIEWER')).toBe(false)
  })
})

describe('invitation tokens', () => {
  it('are random, and only their hash is kept', () => {
    const a = newInvitationToken()
    const b = newInvitationToken()
    expect(a.token).not.toBe(b.token)
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInvitationToken(a.token)).toBe(a.tokenHash)
  })

  it('reject anything that is not a token before any lookup', () => {
    expect(hashInvitationToken('')).toBeNull()
    expect(hashInvitationToken('../../etc/passwd')).toBeNull()
    expect(hashInvitationToken(`${'a'.repeat(43)}x`)).toBeNull()
  })

  it('link to the invitation page', () => {
    expect(invitationUrl('t'.repeat(43))).toMatch(/\/invite\/t{43}$/)
  })
})
