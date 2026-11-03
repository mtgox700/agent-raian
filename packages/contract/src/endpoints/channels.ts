/** Multichannel accounts: list, connect (Unipile hosted auth), disconnect. */

import { z } from 'zod'
import { endpoint, Id, Ok } from '../define'
import { ChannelProvider, ChannelRow } from '../schemas/channels'

export const channelsEndpoints = [
  // app/api/channels/route.ts
  endpoint({
    id: 'channels.list',
    method: 'GET',
    path: '/api/channels',
    summary: 'Multichannel accounts visible to the caller (pending ones are reconciled with Unipile first).',
    auth: 'session',
    response: z.object({ channels: z.array(ChannelRow) }),
  }),

  // app/api/channels/connect/route.ts
  endpoint({
    id: 'channels.connect',
    method: 'POST',
    path: '/api/channels/connect',
    summary: 'Start connecting a channel: returns the Unipile hosted-auth URL (WhatsApp is refused with 400).',
    auth: 'stepUp',
    body: z.object({ provider: ChannelProvider }),
    response: z.object({ url: z.string(), channelId: Id }),
  }),

  // app/api/channels/[channelId]/route.ts
  endpoint({
    id: 'channels.disconnect',
    method: 'DELETE',
    path: '/api/channels/[channelId]',
    summary: 'Disconnect a channel (its owner or an admin) and revoke the Unipile account.',
    auth: 'stepUp',
    params: z.object({ channelId: Id }),
    response: Ok,
  }),
]
