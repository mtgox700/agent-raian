-- Full workspace exports, kept 7 days (E1 lot D).
CREATE TABLE "WorkspaceExport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "archive" BYTEA,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceExport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceExport_workspaceId_createdAt_idx" ON "WorkspaceExport"("workspaceId", "createdAt");
CREATE INDEX "WorkspaceExport_expiresAt_idx" ON "WorkspaceExport"("expiresAt");

-- Notification sent to whoever asked for the export.
ALTER TYPE "NotificationType" ADD VALUE 'EXPORT_READY';
