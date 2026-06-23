-- GoBD-Belegarchiv (Kap. 10): unveränderbares Register zum WORM-Objektspeicher.
CREATE TABLE "ArchivedDocument" (
    "id" TEXT NOT NULL,
    "belegart" TEXT NOT NULL,
    "sourceEntity" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storageKey" TEXT NOT NULL,
    "retentionClass" TEXT NOT NULL,
    "earliestDeletion" TIMESTAMP(3) NOT NULL,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedBy" TEXT,
    CONSTRAINT "ArchivedDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArchivedDocument_sourceEntity_sourceId_sha256_key" ON "ArchivedDocument"("sourceEntity", "sourceId", "sha256");
CREATE INDEX "ArchivedDocument_belegart_idx" ON "ArchivedDocument"("belegart");
CREATE INDEX "ArchivedDocument_archivedAt_idx" ON "ArchivedDocument"("archivedAt");
