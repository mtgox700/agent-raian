-- Workspace deletion with a 30-day grace period (E1 lot D).
ALTER TABLE "Workspace" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "Workspace" ADD COLUMN "deletionScheduledFor" TIMESTAMP(3);
ALTER TABLE "Workspace" ADD COLUMN "deletionRequestedById" TEXT;
CREATE INDEX "Workspace_deletionScheduledFor_idx" ON "Workspace"("deletionScheduledFor");

-- The audit trail stays append only, with one exception: the purge of a
-- deleted workspace erases that workspace's rows, inside the transaction
-- that sets phantera.erase_workspace to its id (SET LOCAL semantics).
CREATE OR REPLACE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'AuditEvent cannot be truncated';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditEvent is append only';
  END IF;
  IF OLD."workspaceId" = current_setting('phantera.erase_workspace', true) THEN
    RETURN OLD;
  END IF;
  IF OLD."createdAt" > (CURRENT_TIMESTAMP - INTERVAL '13 months') THEN
    RAISE EXCEPTION 'AuditEvent rows are kept 13 months';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
