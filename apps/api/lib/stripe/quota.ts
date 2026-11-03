/**
 * Phantera: Plan quota enforcement
 *
 * Centralized quota checks for campaigns, leads, and email steps.
 * Called from server actions before creating resources.
 */

import { db } from '@/lib/db'
import { getPlanLimits } from './plans'
import type { Plan } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuotaResult {
  allowed: boolean
  current: number
  limit: number
  planName: string
}

// ─── Campaign quota ───────────────────────────────────────────────────────────

export async function checkCampaignQuota(workspaceId: string): Promise<QuotaResult> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  })

  const plan: Plan = workspace?.plan ?? 'FREE'
  const limits = getPlanLimits(plan)
  const limit = limits.campaignsLimit

  if (limit === Infinity) {
    return { allowed: true, current: 0, limit: Infinity, planName: plan }
  }

  const current = await db.campaign.count({
    where: { workspaceId, status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } },
  })

  return {
    allowed: current < limit,
    current,
    limit,
    planName: plan,
  }
}

/**
 * Whether one more campaign may be ACTIVE (resuming a paused one). After a
 * downgrade the paused campaigns over the new limit must stay paused:
 * resuming them used to bypass the plan.
 */
export async function canActivateCampaign(workspaceId: string, campaignId: string): Promise<QuotaResult> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  })
  const plan: Plan = workspace?.plan ?? 'FREE'
  const limit = getPlanLimits(plan).campaignsLimit
  if (limit === Infinity) return { allowed: true, current: 0, limit: Infinity, planName: plan }

  const current = await db.campaign.count({
    where: { workspaceId, status: 'ACTIVE', id: { not: campaignId } },
  })
  return { allowed: current < limit, current, limit, planName: plan }
}

// ─── Email steps quota ────────────────────────────────────────────────────────

export function checkEmailStepsQuota(
  plan: Plan,
  requestedSteps: number
): QuotaResult {
  const limits = getPlanLimits(plan)
  const limit = limits.emailStepsLimit

  return {
    allowed: requestedSteps <= limit,
    current: requestedSteps,
    limit,
    planName: plan,
  }
}

// ─── Monthly leads quota ──────────────────────────────────────────────────────

export async function checkLeadQuota(workspaceId: string): Promise<QuotaResult> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  })

  const plan: Plan = workspace?.plan ?? 'FREE'
  const limits = getPlanLimits(plan)
  const limit = limits.leadsLimit

  if (limit === Infinity) {
    return { allowed: true, current: 0, limit: Infinity, planName: plan }
  }

  // Count leads created this calendar month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const current = await db.lead.count({
    where: { workspaceId, createdAt: { gte: startOfMonth } },
  })

  return {
    allowed: current < limit,
    current,
    limit,
    planName: plan,
  }
}

// ─── Email sends quota (monthly) ─────────────────────────────────────────────

export async function checkEmailSendQuota(workspaceId: string): Promise<QuotaResult> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  })

  const plan: Plan = workspace?.plan ?? 'FREE'
  const limits = getPlanLimits(plan)
  const limit = limits.emailSendsLimit

  if (limit === Infinity) {
    return { allowed: true, current: 0, limit: Infinity, planName: plan }
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const current = await db.emailSend.count({
    where: {
      campaign: { workspaceId },
      status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
      createdAt: { gte: startOfMonth },
    },
  })

  return {
    allowed: current < limit,
    current,
    limit,
    planName: plan,
  }
}

// ─── AI generation quota ──────────────────────────────────────────────────────

export function checkAiGenerationAllowed(plan: Plan): boolean {
  return getPlanLimits(plan).hasAiGeneration
}

/**
 * Advanced AI advisors (Conseiller ICP + Campagne express): Business and
 * Enterprise only (founder decision 2026-07-17): these are the premium
 * differentiators that justify the higher tiers.
 */
export function checkAiAdvisorAllowed(plan: Plan): boolean {
  return plan === 'BUSINESS' || plan === 'ENTERPRISE'
}

// ─── Quota warning (80% threshold) ───────────────────────────────────────────

/**
 * Fires a QUOTA_WARNING notification the first time usage crosses 80% of the
 * monthly lead limit. Called after every lead-search batch completes.
 * Idempotent: only creates a notification if one doesn't already exist for
 * the current calendar month.
 */
export async function maybeFireLeadQuotaWarning(workspaceId: string): Promise<void> {
  const result = await checkLeadQuota(workspaceId)
  if (result.limit === Infinity) return

  const pct = result.current / result.limit
  if (pct < 0.8) return

  // Check if we already sent a warning this month to avoid spam
  const now          = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const existing = await db.notification.findFirst({
    where: {
      workspaceId,
      type:      'QUOTA_WARNING',
      createdAt: { gte: startOfMonth },
    },
    select: { id: true },
  })
  if (existing) return

  const used = result.current
  const max  = result.limit
  const pctDisplay = Math.round(pct * 100)

  await db.notification.create({
    data: {
      workspaceId,
      type:  'QUOTA_WARNING',
      title: `${pctDisplay}% de votre quota leads utilisé`,
      body:  `${used}/${max} leads ce mois. Passez à un plan supérieur pour continuer à prospecter sans interruption.`,
      data:  { used, max, pct: pctDisplay },
    },
  })
}
