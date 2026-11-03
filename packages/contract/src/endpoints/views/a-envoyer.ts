/** View endpoint: the data of the "À envoyer" page (/dashboard/a-envoyer). */

import { z } from 'zod'
import { endpoint } from '../../define'
import { QueuedTouch } from '../../schemas/touch'

/** No lead access: the page sends to onboarding. */
export const AEnvoyerViewRedirect = z.object({ redirect: z.literal('/onboarding') })

export const aEnvoyerViewEndpoints = [
  // app/api/views/a-envoyer/route.ts
  endpoint({
    id: 'views.aEnvoyer',
    method: 'GET',
    path: '/api/views/a-envoyer',
    summary: '"À envoyer" page: queued WhatsApp/SMS drafts (up to 100) and the sends left today (`{ redirect }` without lead access).',
    auth: 'session',
    response: z.union([
      AEnvoyerViewRedirect,
      z.object({ items: z.array(QueuedTouch), remainingToday: z.number().int() }),
    ]),
  }),
]
