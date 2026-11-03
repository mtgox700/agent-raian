-- Phase 2: Notifications system

CREATE TYPE "NotificationType" AS ENUM (
  'LEAD_REPLIED_POSITIVE',
  'LEAD_REPLIED_MEETING',
  'LEAD_REPLIED_NEGATIVE',
  'CAMPAIGN_COMPLETED',
  'QUOTA_WARNING'
);

CREATE TABLE "Notification" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type"        "NotificationType" NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "data"        JSONB NOT NULL DEFAULT '{}',
  "leadId"      TEXT,
  "campaignId"  TEXT,
  "readAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_workspaceId_readAt_createdAt_idx"
  ON "Notification"("workspaceId", "readAt", "createdAt" DESC);

CREATE INDEX "Notification_workspaceId_createdAt_idx"
  ON "Notification"("workspaceId", "createdAt" DESC);

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
