-- One-click actions from an alert (E4-b): what each alert offers, and what was done.
ALTER TABLE "Insight" ADD COLUMN "actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "InsightAction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "campaignId" TEXT,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "before" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "InsightAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InsightAction_workspaceId_createdAt_idx" ON "InsightAction"("workspaceId", "createdAt");
CREATE INDEX "InsightAction_campaignId_createdAt_idx" ON "InsightAction"("campaignId", "createdAt");

ALTER TABLE "InsightAction" ADD CONSTRAINT "InsightAction_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
