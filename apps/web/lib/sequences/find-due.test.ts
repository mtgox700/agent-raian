import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { findLeadsDueForNextStep } from './find-due'

type Send = { leadId: string; emailStepId: string; status: string; sentAt: Date | null; attempts?: number }

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-20T12:00:00Z')
const steps = [
  { id: 's1', position: 0, dayOffset: 0 },
  { id: 's2', position: 1, dayOffset: 3 }, // WhatsApp step
  { id: 's3', position: 2, dayOffset: 7 },
]

function fakeDb(sends: Send[]) {
  const lead = { doNotContact: false, status: 'contacted' }
  return {
    campaignEmailStep: { findMany: async () => steps },
    campaign: { findUnique: async () => ({ workspaceId: 'w1' }) },
    emailSend: {
      findMany: async ({ where }: { where: { emailStepId: string; status: string | { in: string[] }; attempts?: unknown } }) =>
        sends
          .filter((s) => s.emailStepId === where.emailStepId)
          .filter((s) => typeof where.status === 'string'
            ? s.status === where.status && (s.attempts ?? 0) >= 3
            : where.status.in.includes(s.status))
          .map((s) => ({ ...s, lead })),
    },
  } as unknown as PrismaClient
}

const sent = (step: string, daysAgo: number, status = 'SENT'): Send =>
  ({ leadId: 'l1', emailStepId: step, status, sentAt: new Date(now.getTime() - daysAgo * DAY) })

describe('sequence progression with WhatsApp / SMS steps', () => {
  it('waits while the WhatsApp step sits in the user’s queue', async () => {
    const due = await findLeadsDueForNextStep(fakeDb([sent('s1', 8), sent('s2', 5, 'AWAITING_USER')]), 'c1', now)
    expect(due).toEqual([])
  })

  it('goes on to the next step once the WhatsApp step is sent', async () => {
    const due = await findLeadsDueForNextStep(fakeDb([sent('s1', 8), sent('s2', 5)]), 'c1', now)
    expect(due.map((d) => d.nextStepId)).toEqual(['s3'])
  })

  it('goes on when the step was passed over (no number, or skipped)', async () => {
    const due = await findLeadsDueForNextStep(fakeDb([sent('s1', 8), sent('s2', 5, 'SKIPPED')]), 'c1', now)
    expect(due.map((d) => d.nextStepId)).toEqual(['s3'])
  })

  it('never queues a skipped step again', async () => {
    const due = await findLeadsDueForNextStep(fakeDb([sent('s1', 4), sent('s2', 1, 'SKIPPED')]), 'c1', now)
    expect(due).toEqual([])
  })
})
