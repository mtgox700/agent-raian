-- CreateTable: EmailReply (Agent 5 — reply tracking)

CREATE TABLE "EmailReply" (
    "id"             TEXT NOT NULL,
    "emailSendId"    TEXT NOT NULL,
    "campaignId"     TEXT NOT NULL,
    "leadId"         TEXT NOT NULL,
    "receivedAt"     TIMESTAMP(3) NOT NULL,
    "fromEmail"      TEXT NOT NULL,
    "bodyText"       TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "confidence"     INTEGER NOT NULL,
    "isProcessed"    BOOLEAN NOT NULL DEFAULT false,
    "processedAt"    TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailReply_emailSendId_idx" ON "EmailReply"("emailSendId");
CREATE INDEX "EmailReply_campaignId_idx"  ON "EmailReply"("campaignId");
CREATE INDEX "EmailReply_leadId_idx"      ON "EmailReply"("leadId");

-- AddForeignKey
ALTER TABLE "EmailReply" ADD CONSTRAINT "EmailReply_emailSendId_fkey"
    FOREIGN KEY ("emailSendId") REFERENCES "EmailSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailReply" ADD CONSTRAINT "EmailReply_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailReply" ADD CONSTRAINT "EmailReply_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
