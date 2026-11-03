-- Failed delivery attempts per send: send-step stops retrying after 3, so a
-- permanently failing step no longer retries every hour forever.
ALTER TABLE "EmailSend" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- Raised when a workspace has mailboxes but none is connected: campaigns wait
-- instead of silently switching to the shared Phantera domain.
ALTER TYPE "NotificationType" ADD VALUE 'MAILBOX_DISCONNECTED';
