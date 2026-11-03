-- Every change of a campaign's status, written by the database itself:
-- launch, pause by hand or by the system (mailbox lost, hand-over, deletion),
-- resume, end of sequence. A trigger catches every path, updateMany included.
CREATE TABLE "CampaignStatusEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromStatus" "CampaignStatus",
    "toStatus" "CampaignStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignStatusEvent_workspaceId_at_idx" ON "CampaignStatusEvent"("workspaceId", "at");
CREATE INDEX "CampaignStatusEvent_campaignId_at_idx" ON "CampaignStatusEvent"("campaignId", "at");

ALTER TABLE "CampaignStatusEvent" ADD CONSTRAINT "CampaignStatusEvent_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION campaign_status_event() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM NEW."status" THEN
    INSERT INTO "CampaignStatusEvent" ("id", "campaignId", "workspaceId", "fromStatus", "toStatus", "at")
    VALUES (gen_random_uuid()::text, NEW."id", NEW."workspaceId",
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."status" END, NEW."status", CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Campaign_status_event"
  AFTER INSERT OR UPDATE OF "status" ON "Campaign"
  FOR EACH ROW EXECUTE FUNCTION campaign_status_event();

-- The past that is known for sure: when a sequence ended. Nothing else is guessed.
INSERT INTO "CampaignStatusEvent" ("id", "campaignId", "workspaceId", "fromStatus", "toStatus", "at")
SELECT gen_random_uuid()::text, c."id", c."workspaceId", 'ACTIVE', 'COMPLETED', c."completedAt"
FROM "Campaign" c
WHERE c."status" = 'COMPLETED' AND c."completedAt" IS NOT NULL;
