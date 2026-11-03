/** Security shapes (apps/api/lib/audit/audit.ts, app/api/security/**). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const AuditEvent = z.object({
  id: Id,
  actorLabel: z.string(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  ipPrefix: z.string().nullable(),
  userAgent: z.string().nullable(),
  result: z.string(), // SUCCESS | DENIED | FAILURE
  details: z.unknown(), // Prisma Json?: free-form, non-sensitive
  createdAt: IsoDate,
  /** Human label of `action` (auditLabel). */
  label: z.string(),
})
