-- Campaigns, mailboxes and channels belong to the member who runs them.
-- Existing rows go to the workspace owner, so nothing changes for anyone
-- today: until invitations exist, the owner is the only member.

ALTER TABLE "Campaign" ADD COLUMN "ownerUserId" TEXT;
UPDATE "Campaign" c SET "ownerUserId" = w."ownerId" FROM "Workspace" w WHERE w."id" = c."workspaceId";
ALTER TABLE "Campaign" ALTER COLUMN "ownerUserId" SET NOT NULL;

ALTER TABLE "ConnectedMailbox" ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "sharedWithTeam" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ConnectedMailbox" m SET "ownerUserId" = w."ownerId" FROM "Workspace" w WHERE w."id" = m."workspaceId";
ALTER TABLE "ConnectedMailbox" ALTER COLUMN "ownerUserId" SET NOT NULL;

ALTER TABLE "ConnectedChannel" ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "sharedWithTeam" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ConnectedChannel" ch SET "ownerUserId" = w."ownerId" FROM "Workspace" w WHERE w."id" = ch."workspaceId";
ALTER TABLE "ConnectedChannel" ALTER COLUMN "ownerUserId" SET NOT NULL;

ALTER TABLE "Notification" ADD COLUMN "userId" TEXT;

-- Checked at commit (DEFERRABLE INITIALLY DEFERRED): deleting a workspace
-- owner cascades their workspace and these rows with it, which an immediate
-- check refuses. An account that still owns rows in someone else's
-- workspace cannot be deleted: those are handed over first (lib/team/hand-over).
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ConnectedMailbox" ADD CONSTRAINT "ConnectedMailbox_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ConnectedChannel" ADD CONSTRAINT "ConnectedChannel_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "Campaign_workspaceId_ownerUserId_idx" ON "Campaign"("workspaceId", "ownerUserId");
CREATE INDEX "ConnectedMailbox_ownerUserId_idx" ON "ConnectedMailbox"("ownerUserId");
CREATE INDEX "ConnectedChannel_ownerUserId_idx" ON "ConnectedChannel"("ownerUserId");
