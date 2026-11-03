-- The Analyst (E3): saved conversations, the quota ledger and the cost of every model call.
CREATE TABLE "AnalystConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalystConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalystMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT,
    "evidence" JSONB,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalystMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "task" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalystQuestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalystQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalystConversation_workspaceId_userId_updatedAt_idx" ON "AnalystConversation"("workspaceId", "userId", "updatedAt");
CREATE INDEX "AnalystMessage_conversationId_createdAt_idx" ON "AnalystMessage"("conversationId", "createdAt");
CREATE INDEX "LlmUsage_workspaceId_createdAt_idx" ON "LlmUsage"("workspaceId", "createdAt");
CREATE INDEX "AnalystQuestion_workspaceId_createdAt_idx" ON "AnalystQuestion"("workspaceId", "createdAt");

ALTER TABLE "AnalystConversation" ADD CONSTRAINT "AnalystConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalystMessage" ADD CONSTRAINT "AnalystMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AnalystConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalystConversation" ADD CONSTRAINT "AnalystConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalystQuestion" ADD CONSTRAINT "AnalystQuestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalystQuestion" ADD CONSTRAINT "AnalystQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
