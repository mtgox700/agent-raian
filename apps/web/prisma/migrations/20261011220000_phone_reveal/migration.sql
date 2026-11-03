-- Apollo phone lookups: one per lead, answered on a tokenised webhook.
CREATE TABLE IF NOT EXISTS "PhoneReveal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "apolloId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "requestId" TEXT,
    "credits" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PhoneReveal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PhoneReveal_leadId_key" ON "PhoneReveal"("leadId");
CREATE UNIQUE INDEX IF NOT EXISTS "PhoneReveal_tokenHash_key" ON "PhoneReveal"("tokenHash");
CREATE INDEX IF NOT EXISTS "PhoneReveal_workspaceId_createdAt_idx" ON "PhoneReveal"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "PhoneReveal_createdAt_idx" ON "PhoneReveal"("createdAt");

-- No foreign key to "Lead": the row records credits spent and outlives the lead.
