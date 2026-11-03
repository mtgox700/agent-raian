/**
 * Inngest cron: polls connected Gmail/Outlook inboxes for lead replies.
 *
 * PRIMARY schedule for reply detection: the Inngest scheduler is proven to
 * fire in prod (sequence-scheduler has run hourly for weeks), while the Vercel
 * crons were declared in an ignored vercel.json (2026-07-13 incident: replies
 * were never detected). Every 5 minutes in office hours, 30 at night and on weekends;
 * idempotent, so overlap with the Vercel cron (if it also fires) is harmless.
 */

import { inngest } from './client'
import { pollInboxes } from '@/lib/email/poll-inboxes'
import type { StepLike } from './functions'

export const inboxPoller = inngest.createFunction(
  {
    id:       'inbox-poller',
    name:     'Poll connected inboxes for replies',
    retries:  1,  // next tick is at most 30 min away anyway
    // Every 5 minutes on weekdays 8:00-19:55 (Paris), when replies are read;
    // every 30 minutes at night and on weekends. 168 idle wake-ups a day
    // instead of 288 on weekdays, 48 on weekends (see email-drip for why).
    triggers: [
      { cron: 'TZ=Europe/Paris */5 8-19 * * 1-5' },
      { cron: 'TZ=Europe/Paris */30 0-7,20-23 * * 1-5' },
      { cron: 'TZ=Europe/Paris */30 * * * 0,6' },
    ],
  },
  async ({ step }) =>
    (step as unknown as StepLike).run('poll-inboxes', () => pollInboxes()),
)
