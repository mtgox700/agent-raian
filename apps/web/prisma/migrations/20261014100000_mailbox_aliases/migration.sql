-- Send-as aliases per connected mailbox, and the alias a campaign sends as.
ALTER TABLE "ConnectedMailbox" ADD COLUMN IF NOT EXISTS "sendAsAliases" JSONB;
ALTER TABLE "ConnectedMailbox" ADD COLUMN IF NOT EXISTS "aliasesSyncedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "fromAlias" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "senderLostAt" TIMESTAMP(3);
