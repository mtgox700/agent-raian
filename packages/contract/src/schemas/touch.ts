/** WhatsApp / SMS touches (mirror of apps/web/lib/touch/touch.service.ts). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const TouchChannel = z.enum(['WHATSAPP', 'SMS'])

/** A message already sent (`listTouches`). */
export const SentTouch = z.object({
  id: Id,
  channel: TouchChannel,
  body: z.string(),
  createdAt: IsoDate,
})

/** A drafted message waiting in the "A envoyer" queue (`listQueue`). */
export const QueuedTouch = z.object({
  id: Id,
  channel: TouchChannel,
  body: z.string(),
  createdAt: IsoDate,
  lead: z.object({
    id: Id,
    firstName: z.string(),
    lastName: z.string(),
    company: z.string().nullable(),
    title: z.string().nullable(),
    phone: z.string().nullable(),
    doNotContact: z.boolean(),
    status: z.string(),
  }),
})
