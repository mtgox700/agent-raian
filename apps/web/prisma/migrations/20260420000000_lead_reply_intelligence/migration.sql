-- Phase 1: Lead reply intelligence fields
-- Populated by Agent 5 when a reply is received and classified.

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "lastReplyAt"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastReplyClassification" TEXT,
  ADD COLUMN IF NOT EXISTS "lastReplySnippet"        TEXT,
  ADD COLUMN IF NOT EXISTS "doNotContact"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "qualifiedAt"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "wonAt"                   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lostAt"                  TIMESTAMP(3);

-- Indexes for Hot Leads queries
CREATE INDEX IF NOT EXISTS "Lead_workspaceId_status_idx"      ON "Lead"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Lead_workspaceId_lastReplyAt_idx" ON "Lead"("workspaceId", "lastReplyAt" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "Lead_doNotContact_idx"            ON "Lead"("doNotContact");
