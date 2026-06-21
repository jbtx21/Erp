-- CreateTable: variable Mengenstaffeln je Logo (Kap. 4.4 / T-15)
CREATE TABLE "StickereiStaffel" (
    "id" TEXT NOT NULL,
    "logoVersionId" TEXT NOT NULL,
    "minMenge" INTEGER NOT NULL,
    "ekCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickereiStaffel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StickereiStaffel_logoVersionId_idx" ON "StickereiStaffel"("logoVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "StickereiStaffel_logoVersionId_minMenge_key" ON "StickereiStaffel"("logoVersionId", "minMenge");

-- AddForeignKey
ALTER TABLE "StickereiStaffel" ADD CONSTRAINT "StickereiStaffel_logoVersionId_fkey" FOREIGN KEY ("logoVersionId") REFERENCES "LogoVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
