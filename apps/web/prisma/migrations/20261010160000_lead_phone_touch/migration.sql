-- Professional phone on leads, and the WhatsApp/SMS messages users send from
-- their own phone (assisted, never automatic to non-opted-in numbers).
ALTER TABLE "Lead" ADD COLUMN "phone" TEXT;
ALTER TABLE "Lead" ADD COLUMN "phoneSource" TEXT;

CREATE TABLE "LeadTouch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT,
    "channel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadTouch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadTouch_workspaceId_createdAt_idx" ON "LeadTouch"("workspaceId", "createdAt");
CREATE INDEX "LeadTouch_leadId_idx" ON "LeadTouch"("leadId");

ALTER TABLE "LeadTouch" ADD CONSTRAINT "LeadTouch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
