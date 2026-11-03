-- Proactive alerts (E4): one row per cause and target, updated rather than duplicated.
ALTER TYPE "NotificationType" ADD VALUE 'INSIGHT_ALERT';

CREATE TYPE "InsightStatus" AS ENUM ('OPEN', 'SNOOZED', 'RESOLVED');

CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "next" TEXT NOT NULL,
    "status" "InsightStatus" NOT NULL DEFAULT 'OPEN',
    "snoozedUntil" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Insight_workspaceId_key_key" ON "Insight"("workspaceId", "key");
CREATE INDEX "Insight_workspaceId_status_idx" ON "Insight"("workspaceId", "status");
CREATE INDEX "Insight_campaignId_idx" ON "Insight"("campaignId");

ALTER TABLE "Insight" ADD CONSTRAINT "Insight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
