-- B10: Mahnbeleg-Historie (Kap. 9.5) — append-only (G2)

-- CreateTable
CREATE TABLE "DunningNotice" (
    "id" TEXT NOT NULL,
    "openItemId" TEXT NOT NULL,
    "stufe" INTEGER NOT NULL,
    "gebuehrCents" INTEGER NOT NULL,
    "textVorlage" TEXT NOT NULL,
    "erzeugtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DunningNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DunningNotice_openItemId_idx" ON "DunningNotice"("openItemId");

-- AddForeignKey
ALTER TABLE "DunningNotice" ADD CONSTRAINT "DunningNotice_openItemId_fkey" FOREIGN KEY ("openItemId") REFERENCES "OpenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
