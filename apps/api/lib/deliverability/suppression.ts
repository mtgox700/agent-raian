/**
 * Phantera: Suppression list (Phase 0)
 *
 * A workspace-global "never contact" guard. Any address that hard-bounced,
 * complained, or unsubscribed must never be emailed again across ANY campaign
 * in that workspace. We reuse the existing `Lead.doNotContact` flag rather than
 * adding a new table: one source of truth, no schema sprawl.
 *
 * Functions take a minimal injected db client (same pattern as sendStepToLead)
 * so they are unit-testable without a live database.
 */

import { optedOut } from '@/lib/privacy/opt-out'

// ─── Minimal db surface (subset of Prisma) ───────────────────────────────────

export interface SuppressionDb {
  lead: {
    updateMany(args: {
      where: { workspaceId: string; email: { in: string[]; mode: 'insensitive' } }
      data: { doNotContact: true }
    }): Promise<{ count: number }>
    findMany(args: {
      where: { workspaceId: string; email: { in: string[]; mode: 'insensitive' }; doNotContact: true }
      select: { email: true }
    }): Promise<Array<{ email: string }>>
  }
  /** Objections (lib/privacy/opt-out): when present, an objected address is never sendable. */
  optOut?: {
    findMany(args: { where: { scope: string; emailHash: { in: string[] } }; select: { emailHash: true } }): Promise<Array<{ emailHash: string }>>
  }
  /** Shared lead pool: when present, an opposition also withdraws the address from it. */
  globalLead?: {
    updateMany(args: {
      where: { email: { in: string[]; mode: 'insensitive' } }
      data: { suppressed: true }
    }): Promise<{ count: number }>
  }
}

export type SuppressionReason = 'HARD_BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE' | 'MANUAL'

// ─── Email normalization ─────────────────────────────────────────────────────

/** Normalize for consistent matching: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ─── Operations ──────────────────────────────────────────────────────────────

/**
 * Suppress one or more addresses in a workspace (sets doNotContact on every
 * matching lead). Returns how many lead rows were updated.
 */
export async function suppressEmails(
  db: SuppressionDb,
  workspaceId: string,
  emails: string[],
  _reason: SuppressionReason = 'MANUAL',
): Promise<number> {
  const normalized = dedupe(emails.map(normalizeEmail).filter(Boolean))
  if (normalized.length === 0) return 0
  // Stored emails keep their original case: match case-insensitively.
  const res = await db.lead.updateMany({
    where: { workspaceId, email: { in: normalized, mode: 'insensitive' } },
    data: { doNotContact: true },
  })
  // GDPR: an address that opted out, bounced or complained must never be served
  // to another workspace from the shared pool either.
  await db.globalLead?.updateMany({
    where: { email: { in: normalized, mode: 'insensitive' } },
    data: { suppressed: true },
  })
  return res.count
}

/**
 * Given a candidate list, return only the addresses that are NOT suppressed
 * i.e. safe to send to. Run this immediately before any send.
 */
export async function filterSendable(
  db: SuppressionDb,
  workspaceId: string,
  emails: string[],
): Promise<string[]> {
  const normalized = dedupe(emails.map(normalizeEmail).filter(Boolean))
  if (normalized.length === 0) return []
  const suppressed = await db.lead.findMany({
    where: { workspaceId, email: { in: normalized, mode: 'insensitive' }, doNotContact: true },
    select: { email: true },
  })
  const blocked = new Set(suppressed.map((l) => normalizeEmail(l.email)))
  if (db.optOut) {
    const objected = await optedOut({ optOut: db.optOut } as never, workspaceId, normalized)
    for (const e of objected) blocked.add(e)
  }
  return normalized.filter((e) => !blocked.has(e))
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}
