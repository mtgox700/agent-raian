/**
 * Phantera: SDR co-pilot approval persistence.
 *
 * When the SDR orchestrator returns AWAIT_APPROVAL / DRAFT_ONLY, the draft is
 * persisted as a notification of type SDR_APPROVAL_NEEDED so it surfaces in the
 * dashboard approval queue. Reuses the existing Notification model (data JSON
 * holds the plan + draft): no new table.
 *
 * Functions take a minimal injected db client so they are unit-testable.
 */

import type { SdrPlan } from './orchestrator'

export interface SdrDraft {
  subject: string
  body: string
  channel: 'email' | 'linkedin'
}

export interface CreateApprovalInput {
  workspaceId: string
  leadId?: string
  campaignId?: string
  leadName?: string
  plan: SdrPlan
  draft: SdrDraft
}

// Minimal Prisma surface (subset).
export interface ApprovalsDb {
  notification: {
    create(args: {
      data: {
        workspaceId: string
        type: 'SDR_APPROVAL_NEEDED'
        title: string
        body: string
        data: Record<string, unknown>
        leadId?: string | null
        campaignId?: string | null
      }
    }): Promise<{ id: string }>
    findMany(args: {
      where: { workspaceId: string; type: 'SDR_APPROVAL_NEEDED'; readAt: null }
      orderBy: { createdAt: 'desc' }
      take?: number
    }): Promise<Array<{ id: string; data: unknown; leadId: string | null; createdAt: Date }>>
  }
}

/** Persist a pending SDR approval for a lead. Returns the notification id. */
export async function createSdrApproval(db: ApprovalsDb, input: CreateApprovalInput): Promise<string> {
  const who = input.leadName ?? input.leadId ?? 'un lead'
  const title = `Validation SDR : ${input.plan.route.playbook}`
  const body = `Le SDR propose un message (${input.draft.channel}) pour ${who}. Raisons : ${
    input.plan.approvalReasons.join(', ') || 'revue'
  }.`

  const created = await db.notification.create({
    data: {
      workspaceId: input.workspaceId,
      type: 'SDR_APPROVAL_NEEDED',
      title,
      body,
      data: {
        action: input.plan.action,
        playbook: input.plan.route.playbook,
        approvalReasons: input.plan.approvalReasons,
        signalType: input.plan.route.type,
        draft: input.draft,
      },
      leadId: input.leadId ?? null,
      campaignId: input.campaignId ?? null,
    },
  })
  return created.id
}

/** List the pending (unread) SDR approvals for a workspace. */
export async function listPendingApprovals(db: ApprovalsDb, workspaceId: string, take = 50) {
  return db.notification.findMany({
    where: { workspaceId, type: 'SDR_APPROVAL_NEEDED', readAt: null },
    orderBy: { createdAt: 'desc' },
    take,
  })
}
