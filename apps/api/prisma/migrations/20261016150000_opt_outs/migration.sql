-- Prospect objections, kept as keyed fingerprints only (E1 lot D).
CREATE TABLE "OptOut" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OptOut_scope_emailHash_key" ON "OptOut"("scope", "emailHash");
