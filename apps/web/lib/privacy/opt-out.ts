/**
 * A prospect's objection (RGPD art. 21): they clicked « se désabonner », or
 * reported the message as spam.
 *
 * What remains afterwards is only what is needed to honour it forever: a
 * keyed fingerprint of the address, per workspace (the sender they objected
 * to) and for the shared lead pool, which Phantera itself supplies. Their
 * lead rows are anonymised, not deleted, so the sender's campaign statistics
 * stay true; enrichment, reply texts, touch messages and notifications about
 * them are erased, and the pool entry is deleted.
 *
 * The fingerprint is an HMAC keyed from ENCRYPTION_KEY (the stable HMAC root
 * that key rotations do not touch, see lib/security/crypto), so the table
 * cannot be reversed by hashing a list of known addresses.
 */

import { createHmac } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { recordAudit } from '@/lib/audit/audit'

/** The scope of the shared lead pool, beside per-workspace scopes. */
export const POOL_SCOPE = '*'

export type OptOutSource = 'UNSUBSCRIBE' | 'COMPLAINT'

/** Same rule as lib/deliverability/suppression (kept local: that module imports this one). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const REDACTED = '[Supprimé : le contact s’est opposé au traitement]'

/** The address an anonymised lead carries instead of the real one. */
const ANONYMISED_DOMAIN = '@invalid.phantera'

export function isAnonymisedEmail(email: string): boolean {
  return email.startsWith('opposition-') && email.endsWith(ANONYMISED_DOMAIN)
}

/**
 * True when the lead belongs to someone who objected. A reply arriving
 * afterwards (« stop » to an older message) must not bring their data back:
 * the reply handlers drop it.
 */
export async function objectedLead(db: Pick<PrismaClient, 'lead'>, leadId: string): Promise<boolean> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { email: true } })
  return lead ? isAnonymisedEmail(lead.email) : false
}

function optOutKey(): Buffer {
  const root = process.env.ENCRYPTION_KEY
  if (!root) throw new Error('ENCRYPTION_KEY env var is not set')
  return createHmac('sha256', Buffer.from(root, 'hex')).update('phantera/opt-out/v1').digest()
}

/** The fingerprint of an address: the same for every spelling of its case. */
export function optOutHash(email: string): string {
  return createHmac('sha256', optOutKey()).update(normalizeEmail(email)).digest('hex')
}

type Db = Pick<PrismaClient, 'optOut'>

/** The normalised addresses, among `emails`, that objected in `scope`. */
export async function optedOut(db: Db, scope: string, emails: string[]): Promise<Set<string>> {
  const byHash = new Map<string, string>()
  for (const e of emails) {
    const email = normalizeEmail(e)
    if (email) byHash.set(optOutHash(email), email)
  }
  if (byHash.size === 0) return new Set()
  const rows = await db.optOut.findMany({ where: { scope, emailHash: { in: [...byHash.keys()] } }, select: { emailHash: true } })
  return new Set(rows.map((r) => byHash.get(r.emailHash)!))
}

/** Keeps the items whose address has not objected in `scope`. */
export async function withoutOptedOut<T extends { email: string | null | undefined }>(db: Db, scope: string, items: T[]): Promise<T[]> {
  const blocked = await optedOut(db, scope, items.map((i) => i.email ?? '').filter(Boolean))
  return blocked.size === 0 ? items : items.filter((i) => !i.email || !blocked.has(normalizeEmail(i.email)))
}

/**
 * Records the objection and erases what is no longer needed. Idempotent:
 * a second click finds nothing left to erase.
 */
export async function recordOptOut(
  db: PrismaClient,
  input: { workspaceId: string; email: string; source: OptOutSource },
): Promise<{ anonymisedLeads: number }> {
  const email = normalizeEmail(input.email)
  // A replayed link of a lead already anonymised: nothing left to do.
  if (isAnonymisedEmail(email)) return { anonymisedLeads: 0 }
  const emailHash = optOutHash(email)

  const anonymisedLeads = await db.$transaction(async (tx) => {
    await tx.optOut.createMany({
      data: [
        { scope: input.workspaceId, emailHash, source: input.source },
        { scope: POOL_SCOPE, emailHash, source: input.source },
      ],
      skipDuplicates: true,
    })
    await tx.globalLead.deleteMany({ where: { email: { equals: email, mode: 'insensitive' } } })

    const leads = await tx.lead.findMany({
      where:  { workspaceId: input.workspaceId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })
    const leadIds = leads.map((l) => l.id)
    if (leadIds.length === 0) return 0

    for (const id of leadIds) {
      await tx.lead.update({
        where: { id },
        data: {
          firstName: 'Contact', lastName: 'opposé', email: `opposition-${id}${ANONYMISED_DOMAIN}`,
          company: null, title: null, industry: null, linkedinUrl: null, website: null, country: null,
          companySize: null, phone: null, phoneSource: null, apolloId: null, scoreReason: null,
          lastReplySnippet: null, doNotContact: true, status: 'lost',
        },
      })
    }
    await tx.leadEnrichment.deleteMany({ where: { leadId: { in: leadIds } } })
    await tx.emailReply.updateMany({ where: { leadId: { in: leadIds } }, data: { bodyText: REDACTED, fromEmail: `opposition${ANONYMISED_DOMAIN}` } })
    await tx.leadTouch.updateMany({ where: { leadId: { in: leadIds } }, data: { body: REDACTED } })
    await tx.notification.updateMany({
      where: { workspaceId: input.workspaceId, leadId: { in: leadIds } },
      data:  { title: 'Contact opposé', body: REDACTED, data: {} },
    })
    // Exports taken before the objection hold their data: they go too.
    await tx.workspaceExport.deleteMany({ where: { workspaceId: input.workspaceId } })
    return leadIds.length
  })

  await recordAudit(db, { workspaceId: input.workspaceId, userId: null }, {
    action: 'data.opposition', target: { type: 'lead', id: null },
    details: { source: input.source, anonymisedLeads },
  })
  return { anonymisedLeads }
}
