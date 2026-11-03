-- Lookups run on every inbound reply and every provider webhook: reply
-- matching by message id (email) or provider thread id (LinkedIn), Resend
-- webhooks by resendMessageId, and per-campaign status counts. Without these
-- indexes each lookup scanned the whole EmailSend table.
CREATE INDEX "EmailSend_providerMessageId_idx" ON "EmailSend"("providerMessageId");
CREATE INDEX "EmailSend_providerThreadId_idx" ON "EmailSend"("providerThreadId");
CREATE INDEX "EmailSend_resendMessageId_idx" ON "EmailSend"("resendMessageId");
CREATE INDEX "EmailSend_campaignId_status_idx" ON "EmailSend"("campaignId", "status");
