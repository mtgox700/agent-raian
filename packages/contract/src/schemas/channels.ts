/** Multichannel accounts (LinkedIn / WhatsApp through Unipile). */

import { z } from 'zod'
import { Id, IsoDate } from '../define'

export const ChannelProvider = z.enum(['LINKEDIN', 'WHATSAPP'])
export const ChannelStatus = z.enum(['PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR'])

export const ChannelRow = z.object({
  id: Id,
  provider: ChannelProvider,
  status: ChannelStatus,
  label: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: IsoDate,
  sharedWithTeam: z.boolean(),
  mine: z.boolean(),
})
