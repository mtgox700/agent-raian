export const runtime = 'nodejs';

import { db } from '@/lib/db';
import { recordOpen } from '@/lib/email/engagement'
import { rateLimit, getClientKey } from '@/lib/security/rate-limit';

const PIXEL_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const pixelBuffer = Buffer.from(PIXEL_B64, 'base64');

const PIXEL_HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function trackOpen(emailSendId: string): void {
  // updateMany with openedAt: null guard is atomic: prevents double-count
  // when both the pixel and the Resend webhook fire at the same time.
  // First open only, and a status that only moves forward (lib/email/engagement).
  recordOpen(db, emailSendId)
    .then(async (first) => {
      if (!first) return // already tracked, or a send that bounced: skip
      const send = await db.emailSend.findUnique({
        where:  { id: emailSendId },
        select: { campaignId: true },
      })
      if (!send) return
      await db.campaign.update({
        where: { id: send.campaignId },
        data:  { openCount: { increment: 1 } },
      })
    })
    .catch((err: unknown) => {
      console.error('[track/open] DB error:', err)
    })
}

export function GET(request: Request): Response {
  // Rate-limit by IP to neutralise DDoS / DB-flooding via the public pixel URL.
  // 120/min is generous: even a corporate gateway opening many emails fits well below.
  // Pixel response is always returned (200) regardless: we only short-circuit the DB write.
  const limitResult = rateLimit(getClientKey(request), {
    windowSec: 60,
    max: 120,
    scope: 'track:open',
  });

  if (limitResult.allowed) {
    const { searchParams } = new URL(request.url);
    const sid = searchParams.get('sid');
    if (sid) {
      trackOpen(sid);
    }
  }

  return new Response(pixelBuffer, { headers: PIXEL_HEADERS });
}
