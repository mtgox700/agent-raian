-- CreateEnum
CREATE TYPE "ChannelProvider" AS ENUM ('LINKEDIN', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "ConnectedChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "unipileAccountId" TEXT,
    "label" TEXT,
    "status" "ChannelStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedChannel_unipileAccountId_key" ON "ConnectedChannel"("unipileAccountId");

-- CreateIndex
CREATE INDEX "ConnectedChannel_workspaceId_idx" ON "ConnectedChannel"("workspaceId");

-- CreateIndex
CREATE INDEX "ConnectedChannel_status_idx" ON "ConnectedChannel"("status");

-- AddForeignKey
ALTER TABLE "ConnectedChannel" ADD CONSTRAINT "ConnectedChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

