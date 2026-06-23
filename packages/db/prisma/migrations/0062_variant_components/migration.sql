-- Set/Bundle-Stücklisten auf Variantenebene (Kap. 5.1).
ALTER TABLE "Variant" ADD COLUMN "isBundle" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "VariantComponent" (
  "id" TEXT NOT NULL,
  "parentVariantId" TEXT NOT NULL,
  "componentVariantId" TEXT,
  "description" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "position" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "VariantComponent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VariantComponent_parentVariantId_idx" ON "VariantComponent"("parentVariantId");

ALTER TABLE "VariantComponent" ADD CONSTRAINT "VariantComponent_parentVariantId_fkey"
  FOREIGN KEY ("parentVariantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantComponent" ADD CONSTRAINT "VariantComponent_componentVariantId_fkey"
  FOREIGN KEY ("componentVariantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
