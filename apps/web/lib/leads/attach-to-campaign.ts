import type { PrismaClient } from '@prisma/client'

/**
 * Puts leads found by a search into its campaign. A lead already running in
 * a colleague's campaign stays there: only leads of the shared pool and of
 * the campaign owner's own campaigns move. Saving by e-mail used to move any
 * lead of the workspace, which with a team means taking someone's prospect.
 */
export async function attachToCampaign(
  db: Pick<PrismaClient, 'campaign' | 'lead'>,
  input: { workspaceId: string; campaignId: string; leadIds: string[] },
): Promise<number> {
  if (input.leadIds.length === 0) return 0
  const campaign = await db.campaign.findFirst({
    where:  { id: input.campaignId, workspaceId: input.workspaceId },
    select: { ownerUserId: true },
  })
  if (!campaign) return 0
  const { count } = await db.lead.updateMany({
    where: {
      id:          { in: input.leadIds },
      workspaceId: input.workspaceId,
      OR:          [{ campaignId: null }, { campaign: { ownerUserId: campaign.ownerUserId } }],
    },
    data: { campaignId: input.campaignId },
  })
  return count
}

/**
 * Whether a search must leave this address alone: it is already a lead of
 * the workspace running in a campaign of someone other than `actingUserId`
 * (the owner of the campaign being filled, or the person searching). Such a
 * lead is not refreshed, scored, queued nor returned: it is a colleague's.
 */
export async function heldByColleague(
  db: Pick<PrismaClient, 'lead'>,
  workspaceId: string,
  match: { email: string } | { apolloId: string },
  actingUserId: string,
): Promise<boolean> {
  const existing = await db.lead.findFirst({
    where:  { workspaceId, ...match },
    select: { campaign: { select: { ownerUserId: true } } },
  })
  return Boolean(existing?.campaign && existing.campaign.ownerUserId !== actingUserId)
}
