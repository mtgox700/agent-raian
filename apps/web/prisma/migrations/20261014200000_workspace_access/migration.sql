-- Read-only role, and the OWNER membership of every workspace owner
-- (memberships become the source of access; owners created before them
-- had no row).
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'VIEWER';

INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
SELECT 'wm' || substr(md5(w."id" || ':' || w."ownerId"), 1, 23), w."id", w."ownerId", 'OWNER', w."createdAt"
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkspaceMember" m WHERE m."workspaceId" = w."id" AND m."userId" = w."ownerId"
);

UPDATE "WorkspaceMember" m
SET "role" = 'OWNER'
FROM "Workspace" w
WHERE m."workspaceId" = w."id" AND m."userId" = w."ownerId" AND m."role" <> 'OWNER';
