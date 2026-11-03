-- Phase 3: Automated sequence scheduling fields on Campaign

ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "lastProcessedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt"     TIMESTAMP(3);
