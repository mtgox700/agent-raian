/**
 * Tests for Stripe subscription sync logic.
 *
 * Strategy: mock both `stripe` and `db` modules to test the orchestration
 * logic in isolation. We're verifying:
 *   • Active subscription → workspace gets the right Plan
 *   • Inactive subscription → workspace resets to FREE
 *   • Unknown price ID → defaults to FREE
 *   • workspaceId override path (checkout.session.completed scenario)
 *   • stripeSubscriptionId lookup path (subscription.updated scenario)
 *   • Period end timestamp conversion (Stripe seconds → JS Date)
 *   • getOrCreateStripeCustomer: hits cache when customer exists
 *   • getOrCreateStripeCustomer: creates new customer + persists
 *   • resetWorkspaceTofree: nullifies all Stripe fields
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────
// vi.mock() is hoisted to the top of the file by Vitest. To use mock functions
// defined in the test file, declare them via vi.hoisted() so they share the
// same hoisting order.

const mocks = vi.hoisted(() => ({
  mockStripeSubscriptionsRetrieve: vi.fn(),
  mockStripeSubscriptionsCancel:   vi.fn(),
  mockStripeCustomersCreate:       vi.fn(),
  mockDbWorkspaceUpdateMany:       vi.fn(),
  mockDbWorkspaceUpdate:           vi.fn(),
  mockDbWorkspaceFindUnique:       vi.fn(),
  mockDbWorkspaceFindFirst:        vi.fn(),
  mockDbCampaignFindMany:          vi.fn(),
  mockDbCampaignUpdateMany:        vi.fn(),
  mockGetPlanByPriceId:            vi.fn(),
  mockGetPlanLimits:               vi.fn(),
}))

vi.mock('./client', () => ({
  stripe: {
    subscriptions: { retrieve: mocks.mockStripeSubscriptionsRetrieve, cancel: mocks.mockStripeSubscriptionsCancel },
    customers:     { create:   mocks.mockStripeCustomersCreate },
  },
}))

vi.mock('./plans', () => ({
  getPlanByPriceId: mocks.mockGetPlanByPriceId,
  getPlanLimits:    mocks.mockGetPlanLimits,
}))

vi.mock('@/lib/db', () => ({
  db: {
    workspace: {
      updateMany: mocks.mockDbWorkspaceUpdateMany,
      update:     mocks.mockDbWorkspaceUpdate,
      findUnique: mocks.mockDbWorkspaceFindUnique,
      findFirst:  mocks.mockDbWorkspaceFindFirst,
    },
    campaign: {
      findMany:   mocks.mockDbCampaignFindMany,
      updateMany: mocks.mockDbCampaignUpdateMany,
    },
  },
}))

// Static import — Vitest hoists vi.mock() above this, so mocks are in place.
import {
  syncSubscriptionToWorkspace,
  resetWorkspaceTofree,
  getOrCreateStripeCustomer,
} from './sync'

// Short aliases for test bodies
const mockStripeSubscriptionsRetrieve = mocks.mockStripeSubscriptionsRetrieve
const mockStripeCustomersCreate       = mocks.mockStripeCustomersCreate
const mockDbWorkspaceUpdateMany       = mocks.mockDbWorkspaceUpdateMany
const mockDbWorkspaceUpdate           = mocks.mockDbWorkspaceUpdate
const mockDbWorkspaceFindUnique       = mocks.mockDbWorkspaceFindUnique
const mockGetPlanByPriceId            = mocks.mockGetPlanByPriceId
const mockDbWorkspaceFindFirst        = mocks.mockDbWorkspaceFindFirst
const mockDbCampaignFindMany          = mocks.mockDbCampaignFindMany
const mockDbCampaignUpdateMany        = mocks.mockDbCampaignUpdateMany
const mockGetPlanLimits               = mocks.mockGetPlanLimits

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    status: 'active',
    items: {
      data: [
        {
          price: { id: 'price_pro_monthly' },
          current_period_end: 1_800_000_000, // Jan 2027 approx
        },
      ],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDbWorkspaceUpdateMany.mockResolvedValue({ count: 1 })
  mockDbWorkspaceUpdate.mockResolvedValue({ id: 'ws_1' })
  mockDbWorkspaceFindFirst.mockResolvedValue(null)
  mockDbCampaignFindMany.mockResolvedValue([])
  mockDbCampaignUpdateMany.mockResolvedValue({ count: 0 })
  mockGetPlanLimits.mockReturnValue({ campaignsLimit: Infinity })
})

// ─── syncSubscriptionToWorkspace ─────────────────────────────────────────────

describe('syncSubscriptionToWorkspace', () => {
  it('updates workspace with PRO plan when subscription is active', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription())
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_123')

    expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith('sub_123', {
      expand: ['default_payment_method'],
    })
    expect(mockDbWorkspaceUpdateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_123' },
      data: expect.objectContaining({
        plan: 'PRO',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro_monthly',
      }),
    })
  })

  it('updates by workspaceId when override provided (checkout.session.completed)', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription())
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_123', 'ws_explicit_456')

    expect(mockDbWorkspaceUpdateMany).toHaveBeenCalledWith({
      where: { id: 'ws_explicit_456' },
      data: expect.any(Object),
    })
  })

  it('resets to FREE when subscription is canceled', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(
      buildSubscription({ status: 'canceled' }),
    )
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_canceled')

    expect(mockDbWorkspaceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: 'FREE' }),
      }),
    )
  })

  it('keeps the plan while Stripe retries a failed payment (past_due grace period)', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(
      buildSubscription({ status: 'past_due' }),
    )
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_pd')

    expect(mockDbWorkspaceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: 'PRO' }),
      }),
    )
  })

  it('resets to FREE once Stripe gives up on the payment (unpaid)', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(
      buildSubscription({ status: 'unpaid' }),
    )
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_unpaid')

    expect(mockDbWorkspaceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: 'FREE' }),
      }),
    )
  })

  it('keeps subscription active during trialing status', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(
      buildSubscription({ status: 'trialing' }),
    )
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_trial')

    expect(mockDbWorkspaceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: 'PRO' }),
      }),
    )
  })

  it('defaults to FREE when price ID is unknown', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription())
    mockGetPlanByPriceId.mockReturnValue(null) // unknown price

    await syncSubscriptionToWorkspace('sub_unknown_price')

    expect(mockDbWorkspaceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: 'FREE' }),
      }),
    )
  })

  it('converts Stripe period_end (seconds) to JS Date (ms)', async () => {
    const stripeTs = 1_800_000_000 // 2027-01-15ish in seconds
    mockStripeSubscriptionsRetrieve.mockResolvedValue(
      buildSubscription({
        items: { data: [{ price: { id: 'p' }, current_period_end: stripeTs }] },
      }),
    )
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_dates')

    const callArgs = mockDbWorkspaceUpdateMany.mock.calls[0]?.[0] as {
      data: { stripeCurrentPeriodEnd: Date }
    }
    expect(callArgs.data.stripeCurrentPeriodEnd).toBeInstanceOf(Date)
    expect(callArgs.data.stripeCurrentPeriodEnd.getTime()).toBe(stripeTs * 1000)
  })

  it('handles subscription with no items gracefully', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(
      buildSubscription({ items: { data: [] } }),
    )

    await syncSubscriptionToWorkspace('sub_empty')

    expect(mockDbWorkspaceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plan: 'FREE',
          stripePriceId: null,
          stripeCurrentPeriodEnd: null,
        }),
      }),
    )
  })
})

// ─── Campaign limit after a plan change ──────────────────────────────────────

describe('campaign limit enforcement after a plan change', () => {
  it('pauses the oldest active campaigns above the new plan limit', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription({ status: 'canceled' }))
    mockGetPlanByPriceId.mockReturnValue('PRO')
    mockDbWorkspaceFindFirst.mockResolvedValue({ id: 'ws_1' })
    mockDbWorkspaceFindUnique.mockResolvedValue({ plan: 'FREE' })
    mockGetPlanLimits.mockReturnValue({ campaignsLimit: 1 })
    mockDbCampaignFindMany.mockResolvedValue([{ id: 'c_new' }, { id: 'c_mid' }, { id: 'c_old' }])

    await syncSubscriptionToWorkspace('sub_123')

    expect(mockDbCampaignFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'ws_1', status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
    }))
    expect(mockDbCampaignUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c_mid', 'c_old'] } },
      data:  { status: 'PAUSED' },
    })
  })

  it('pauses nothing on an unlimited plan', async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription())
    mockGetPlanByPriceId.mockReturnValue('BUSINESS')
    mockDbWorkspaceFindFirst.mockResolvedValue({ id: 'ws_1' })
    mockDbWorkspaceFindUnique.mockResolvedValue({ plan: 'BUSINESS' })
    mockGetPlanLimits.mockReturnValue({ campaignsLimit: Infinity })

    await syncSubscriptionToWorkspace('sub_123')

    expect(mockDbCampaignUpdateMany).not.toHaveBeenCalled()
  })
})

describe('superseded subscription', () => {
  it('cancels the previous live subscription when a second checkout completes', async () => {
    mockDbWorkspaceFindUnique.mockResolvedValueOnce({ stripeSubscriptionId: 'sub_old' })
    mockStripeSubscriptionsRetrieve.mockImplementation(async (id: string) =>
      id === 'sub_old' ? { id: 'sub_old', status: 'active' } : buildSubscription({ id: 'sub_new' }))
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_new', 'ws_1')

    expect(mocks.mockStripeSubscriptionsCancel).toHaveBeenCalledWith('sub_old')
  })

  it('leaves the workspace alone when the subscription is the same', async () => {
    mockDbWorkspaceFindUnique.mockResolvedValueOnce({ stripeSubscriptionId: 'sub_123' })
    mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription())
    mockGetPlanByPriceId.mockReturnValue('PRO')

    await syncSubscriptionToWorkspace('sub_123', 'ws_1')

    expect(mocks.mockStripeSubscriptionsCancel).not.toHaveBeenCalled()
  })
})

// ─── resetWorkspaceTofree ────────────────────────────────────────────────────

describe('resetWorkspaceTofree', () => {
  it('nullifies all Stripe fields and sets plan to FREE', async () => {
    await resetWorkspaceTofree('ws_to_reset')

    expect(mockDbWorkspaceUpdate).toHaveBeenCalledWith({
      where: { id: 'ws_to_reset' },
      data: {
        plan: 'FREE',
        stripeSubscriptionId: null,
        stripePriceId: null,
        stripeCurrentPeriodEnd: null,
      },
    })
  })
})

// ─── getOrCreateStripeCustomer ───────────────────────────────────────────────

describe('getOrCreateStripeCustomer', () => {
  it('returns existing customer ID when workspace already has one (cache hit)', async () => {
    mockDbWorkspaceFindUnique.mockResolvedValue({
      stripeCustomerId: 'cus_existing_42',
    })

    const result = await getOrCreateStripeCustomer(
      'ws_with_customer',
      'user@example.com',
      'Test User',
    )

    expect(result).toBe('cus_existing_42')
    expect(mockStripeCustomersCreate).not.toHaveBeenCalled()
    expect(mockDbWorkspaceUpdate).not.toHaveBeenCalled()
  })

  it('creates a new Stripe customer when workspace has none', async () => {
    mockDbWorkspaceFindUnique.mockResolvedValue({ stripeCustomerId: null })
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_new_99' })

    const result = await getOrCreateStripeCustomer(
      'ws_new',
      'new@example.com',
      'New User',
    )

    expect(mockStripeCustomersCreate).toHaveBeenCalledWith({
      email: 'new@example.com',
      name: 'New User',
      metadata: { workspaceId: 'ws_new' },
    })
    expect(mockDbWorkspaceUpdate).toHaveBeenCalledWith({
      where: { id: 'ws_new' },
      data: { stripeCustomerId: 'cus_new_99' },
    })
    expect(result).toBe('cus_new_99')
  })

  it('creates a customer when workspace does not exist', async () => {
    mockDbWorkspaceFindUnique.mockResolvedValue(null)
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_orphan' })

    const result = await getOrCreateStripeCustomer(
      'ws_missing',
      'orphan@example.com',
    )

    expect(mockStripeCustomersCreate).toHaveBeenCalled()
    expect(result).toBe('cus_orphan')
  })
})
