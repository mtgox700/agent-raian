-- Automatic SMS through the workspace's own Brevo account.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "smsSettings" JSONB;
