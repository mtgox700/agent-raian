import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { db } from '@/lib/db'
import {
  clerkWebhookEventSchema,
  getPrimaryEmail,
  getFullName,
} from '@/lib/types/clerk-webhooks'
import { trackServer, flushServerEvents } from '@/lib/analytics/server-events'
import { stripe } from '@/lib/stripe/client'
import { cancelSubscriptionsOfUser, type CancelApi, type OwnedWorkspacesDb } from '@/lib/stripe/cancel-on-delete'
import { handOverBeforeAccountDeletion } from '@/lib/team/hand-over'
import { deleteUnipileAccount } from '@/lib/multichannel/unipile'

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

// ─── Webhook secret from Clerk dashboard ─────────────────────────────────────
const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'CLERK_WEBHOOK_SECRET is not configured' },
      { status: 500 }
    )
  }

  // ─── Verify svix signature ────────────────────────────────────────────────
  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    )
  }

  const body = await req.text()

  let rawEvent: unknown
  try {
    const wh = new Webhook(WEBHOOK_SECRET)
    rawEvent = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 401 }
    )
  }

  // ─── Parse + validate event ───────────────────────────────────────────────
  const parsed = clerkWebhookEventSchema.safeParse(rawEvent)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Unrecognized webhook event type' },
      { status: 400 }
    )
  }

  const event = parsed.data

  try {
    switch (event.type) {
      case 'user.created': {
        const userData = event.data
        const email = getPrimaryEmail(userData)
        const name = getFullName(userData)

        if (!email) {
          return NextResponse.json(
            { error: 'No primary email address found' },
            { status: 400 }
          )
        }

        // Atomic check-and-create inside a single transaction.
        // Prevents the race where two concurrent webhook deliveries both pass
        // the existence check and both create a workspace.
        const created = await db.$transaction(async (tx: TransactionClient) => {
          const existing = await tx.user.findUnique({
            where:  { clerkId: userData.id },
            select: { id: true },
          })
          if (existing) return { skipped: true as const }

          const user = await tx.user.create({
            data: {
              clerkId: userData.id,
              email,
              name,
              imageUrl: userData.image_url ?? null,
            },
          })

          const workspace = await tx.workspace.create({
            data: {
              name: name ? `${name}'s Workspace` : 'My Workspace',
              ownerId: user.id,
              onboardingCompleted: false,
            },
          })

          await tx.workspaceMember.create({
            data: {
              workspaceId: workspace.id,
              userId: user.id,
              role: 'OWNER',
            },
          })

          return { skipped: false as const }
        })

        if (created.skipped) {
          return NextResponse.json({ message: 'User already exists' })
        }

        // ── Analytics: first AARRR activation milestone ──
        trackServer(userData.id, 'signup_completed', {
          clerkId: userData.id,
        })
        await flushServerEvents()

        break
      }

      case 'user.updated': {
        const userData = event.data
        const email = getPrimaryEmail(userData)
        const name = getFullName(userData)

        await db.user.updateMany({
          where: { clerkId: userData.id },
          data: {
            ...(email && { email }),
            ...(name !== undefined && { name }),
            ...(userData.image_url !== undefined && { imageUrl: userData.image_url }),
          },
        })

        break
      }

      case 'user.deleted': {
        const { id: clerkId } = event.data

        // 1. Billing stops first: the person leaving was the one paying. If
        //    Stripe refuses, the 500 below makes Clerk retry with nothing
        //    else changed yet. A workspace that passes to the team (step 2)
        //    drops to its free plan until its new owner subscribes.
        // 2. Every workspace it bills for, with anyone else in the team, goes
        //    to the next in line; in the workspaces it does not own, its
        //    campaigns go to the owner (paused) and its mailboxes and
        //    channels are removed. One transaction.
        // 3. Then the removed LinkedIn accounts are revoked at Unipile.
        if (clerkId) {
          await cancelSubscriptionsOfUser(
            db as unknown as OwnedWorkspacesDb,
            stripe as unknown as CancelApi,
            clerkId,
          )
          const handedOver = await db.$transaction((tx) => handOverBeforeAccountDeletion(tx, clerkId))
          for (const accountId of handedOver.flatMap((r) => r.channelAccounts)) {
            await deleteUnipileAccount(accountId).catch((err: unknown) => {
              console.warn('[clerk-webhook] unipile revoke failed:', err instanceof Error ? err.message : String(err))
            })
          }
        }

        // Cascade delete via Prisma relations (User -> Workspace, WorkspaceMember)
        await db.user.deleteMany({
          where: { clerkId },
        })

        break
      }
    }
  } catch (error) {
    console.error('[clerk-webhook] failed:', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: 'Database operation failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ message: 'Webhook processed successfully' })
}
