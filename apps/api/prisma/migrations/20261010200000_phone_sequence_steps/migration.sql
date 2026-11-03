-- WhatsApp / SMS sequence steps: drafted by Phantera, sent by the user from
-- their own phone through the "À envoyer" queue.
ALTER TYPE "StepChannel" ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE "StepChannel" ADD VALUE IF NOT EXISTS 'SMS';
ALTER TYPE "EmailSendStatus" ADD VALUE IF NOT EXISTS 'AWAITING_USER';
ALTER TYPE "EmailSendStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

ALTER TABLE "LeadTouch" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SENT';
ALTER TABLE "LeadTouch" ADD COLUMN "emailSendId" TEXT;
ALTER TABLE "LeadTouch" ADD COLUMN "sentAt" TIMESTAMP(3);
UPDATE "LeadTouch" SET "sentAt" = "createdAt" WHERE "sentAt" IS NULL;

CREATE UNIQUE INDEX "LeadTouch_emailSendId_key" ON "LeadTouch"("emailSendId");
CREATE INDEX "LeadTouch_workspaceId_status_idx" ON "LeadTouch"("workspaceId", "status");
