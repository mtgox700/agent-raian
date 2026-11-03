/**
 * Account deletion must stop billing: deleting the user (and, by cascade, its
 * workspaces) used to leave the Stripe subscription running.
 */

export interface CancelApi {
  subscriptions: { cancel(id: string): Promise<unknown> }
}

export interface OwnedWorkspacesDb {
  workspace: {
    findMany(args: {
      where: { owner: { clerkId: string }; stripeSubscriptionId: { not: null } }
      select: { stripeSubscriptionId: true }
    }): Promise<Array<{ stripeSubscriptionId: string | null }>>
  }
}

function isAlreadyGone(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number; message?: string }
  return e?.code === 'resource_missing' || e?.statusCode === 404
    || /already (been )?cancel/i.test(e?.message ?? '')
}

/**
 * Cancels every subscription of the workspaces owned by this Clerk user.
 * Throws when a cancellation fails, so the caller can refuse the deletion and
 * let the webhook be retried rather than delete a still-billing account.
 */
export async function cancelSubscriptionsOfUser(
  db: OwnedWorkspacesDb,
  stripe: CancelApi,
  clerkId: string,
): Promise<number> {
  const workspaces = await db.workspace.findMany({
    where:  { owner: { clerkId }, stripeSubscriptionId: { not: null } },
    select: { stripeSubscriptionId: true },
  })
  let cancelled = 0
  for (const { stripeSubscriptionId } of workspaces) {
    if (!stripeSubscriptionId) continue
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId)
      cancelled++
    } catch (err) {
      if (!isAlreadyGone(err)) throw err
    }
  }
  return cancelled
}
