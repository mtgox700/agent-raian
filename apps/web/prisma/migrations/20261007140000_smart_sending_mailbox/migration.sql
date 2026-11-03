-- Smart sending: per-mailbox daily cap (default 50), optional warm-up ramp
-- (off by default), a pause timestamp set when the provider refuses sends,
-- and the pacing slot (last send) claimed atomically before each email.
-- Additive; existing mailboxes get the defaults.
ALTER TABLE "ConnectedMailbox" ADD COLUMN "dailyCap" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "ConnectedMailbox" ADD COLUMN "warmupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConnectedMailbox" ADD COLUMN "sendPausedUntil" TIMESTAMP(3);
ALTER TABLE "ConnectedMailbox" ADD COLUMN "lastSendAt" TIMESTAMP(3);
ALTER TYPE "NotificationType" ADD VALUE 'MAILBOX_PAUSED';
