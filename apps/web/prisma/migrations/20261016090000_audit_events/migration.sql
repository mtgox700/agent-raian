-- Audit log, append only (E1 lot C).
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ipPrefix" TEXT,
    "userAgent" TEXT,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- The trail cannot be rewritten: no UPDATE ever, and DELETE only for rows
-- past the 13-month retention. Enforced here so that neither a bug nor a
-- compromised application path can edit history.
CREATE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'AuditEvent cannot be truncated';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditEvent is append only';
  END IF;
  IF OLD."createdAt" > (CURRENT_TIMESTAMP - INTERVAL '13 months') THEN
    RAISE EXCEPTION 'AuditEvent rows are kept 13 months';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_append_only"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();

-- TRUNCATE skips row triggers.
CREATE TRIGGER "AuditEvent_no_truncate"
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_event_append_only();

-- Team option: a second factor is required before sensitive actions.
ALTER TABLE "Workspace" ADD COLUMN "requireTwoFactor" BOOLEAN NOT NULL DEFAULT false;
