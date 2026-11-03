-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SDR_APPROVAL_NEEDED';

-- CreateTable
CREATE TABLE "GlobalLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "apolloId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "company" TEXT,
    "title" TEXT,
    "industry" TEXT,
    "linkedinUrl" TEXT,
    "website" TEXT,
    "country" TEXT,
    "companySize" "TargetCompanySize",
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailConfidence" INTEGER,
    "emailStatus" TEXT,
    "linkedinData" JSONB,
    "source" "LeadSource" NOT NULL DEFAULT 'APOLLO',
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "timesServed" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalLead_email_key" ON "GlobalLead"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalLead_apolloId_key" ON "GlobalLead"("apolloId");

-- CreateIndex
CREATE INDEX "GlobalLead_industry_idx" ON "GlobalLead"("industry");

-- CreateIndex
CREATE INDEX "GlobalLead_country_idx" ON "GlobalLead"("country");

-- CreateIndex
CREATE INDEX "GlobalLead_companySize_idx" ON "GlobalLead"("companySize");

-- CreateIndex
CREATE INDEX "GlobalLead_suppressed_lastRefreshedAt_idx" ON "GlobalLead"("suppressed", "lastRefreshedAt");

