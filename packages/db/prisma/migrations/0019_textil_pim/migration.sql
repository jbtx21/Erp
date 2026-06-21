-- B18: Textil-PIM-Erweiterung (Kap. 3, EU-VO 1007/2011)

-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('IMAGE', 'PRINT_TEMPLATE', 'EMBROIDERY_FILE');

-- CreateEnum
CREATE TYPE "FinishingMethod" AS ENUM ('STICK', 'DRUCK', 'TRANSFER');

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" TEXT,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "variantId" TEXT,
    "url" TEXT NOT NULL,
    "kind" "MediaAssetKind" NOT NULL DEFAULT 'IMAGE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinishingSpec" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "method" "FinishingMethod" NOT NULL,
    "placement" TEXT NOT NULL,
    "stitchCount" INTEGER,
    "colorCount" INTEGER,

    CONSTRAINT "FinishingSpec_pkey" PRIMARY KEY ("id")
);

-- AlterTable Article: Textil-Pflicht-/Stammattribute
ALTER TABLE "Article" ADD COLUMN "materialComposition" TEXT;
ALTER TABLE "Article" ADD COLUMN "careInstructions" TEXT;
ALTER TABLE "Article" ADD COLUMN "brand" TEXT;
ALTER TABLE "Article" ADD COLUMN "hsCode" TEXT;
ALTER TABLE "Article" ADD COLUMN "originCountry" TEXT;
ALTER TABLE "Article" ADD COLUMN "collectionId" TEXT;

-- AlterTable Variant: GTIN/Gewicht
ALTER TABLE "Variant" ADD COLUMN "gtin" TEXT;
ALTER TABLE "Variant" ADD COLUMN "weightGrams" INTEGER;

-- CreateIndex
CREATE INDEX "MediaAsset_articleId_idx" ON "MediaAsset"("articleId");
CREATE INDEX "MediaAsset_variantId_idx" ON "MediaAsset"("variantId");
CREATE INDEX "FinishingSpec_articleId_idx" ON "FinishingSpec"("articleId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinishingSpec" ADD CONSTRAINT "FinishingSpec_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
