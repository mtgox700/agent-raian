-- CreateEnum
CREATE TYPE "StepChannel" AS ENUM ('EMAIL', 'LINKEDIN');

-- AlterTable
ALTER TABLE "CampaignEmailStep" ADD COLUMN     "channel" "StepChannel" NOT NULL DEFAULT 'EMAIL';

