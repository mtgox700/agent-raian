-- Records which connected mailbox sent each email (NULL = Resend shared
-- domain), so the deliverability gate can enforce a per-mailbox daily cap and
-- the warm-up ramp. Additive and nullable: existing rows keep NULL.
ALTER TABLE "EmailSend" ADD COLUMN "mailboxId" TEXT;

CREATE INDEX "EmailSend_mailboxId_sentAt_idx" ON "EmailSend"("mailboxId", "sentAt");

ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_mailboxId_fkey"
  FOREIGN KEY ("mailboxId") REFERENCES "ConnectedMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
