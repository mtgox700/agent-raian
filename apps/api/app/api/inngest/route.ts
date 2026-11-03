/**
 * Inngest serve endpoint.
 *
 * Inngest calls this URL to register functions and invoke them. It must be
 * public (the request is signed by Inngest, verified via INNGEST_SIGNING_KEY in
 * prod). Already covered by the public-route matcher in proxy/middleware
 * (/api/inngest is not auth-gated).
 */

import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { inngestFunctions } from '@/lib/inngest/functions'
import { sdrSignalFunction } from '@/lib/inngest/sdr'
import { leadPipeline } from '@/lib/inngest/lead-pipeline'
import { inboxPoller } from '@/lib/inngest/inbox-poller'
import { emailDrip } from '@/lib/inngest/email-drip'
import { workspaceExport } from '@/lib/inngest/workspace-export'
import { leadRescore } from '@/lib/inngest/lead-rescore'
import { insightsSweep } from '@/lib/inngest/insights'
import { housekeeping } from '@/lib/inngest/housekeeping'

export const runtime = 'nodejs'
// The lead pipeline step can run up to a few minutes; give the function room
// (Vercel Pro). Inngest also splits work across invocations, so individual
// steps stay well under this.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...inngestFunctions, sdrSignalFunction, leadPipeline, inboxPoller, emailDrip, workspaceExport, housekeeping, leadRescore, insightsSweep],
})
