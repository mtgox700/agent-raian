/**
 * Data of the "À envoyer" page (/dashboard/a-envoyer), served by
 * GET /api/views/a-envoyer: WhatsApp/SMS sequence steps drafted by Phantera,
 * sent by the user from their phone, one tap each.
 */

import type { AccessContext } from '@/lib/auth/access'
import { listQueue } from '@/lib/touch/touch.service'

type Queue = Awaited<ReturnType<typeof listQueue>>
export type AEnvoyerItem = Omit<Queue['items'][number], 'createdAt'> & { createdAt: string }

export async function aEnvoyerView(workspace: AccessContext): Promise<{ items: AEnvoyerItem[]; remainingToday: number }> {
  const { items, remainingToday } = await listQueue(workspace)
  return {
    items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
    remainingToday,
  }
}
