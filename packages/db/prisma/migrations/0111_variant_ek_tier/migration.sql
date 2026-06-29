-- EK-Mengenstaffel je Variante (Veredelung/Stick): eigener EK je Stufe (VK der Stickerei an
-- uns), Quelle für den Deckungsbeitrag je Stufe im Angebot. Ergänzt den flachen
-- SupplierItem.ekCents um eine echte EK-Staffel. Additiv — Bestand bleibt grün.
CREATE TABLE "VariantEkTier" (
  "id"        TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "minMenge"  INTEGER NOT NULL,
  "ekCents"   INTEGER NOT NULL,
  CONSTRAINT "VariantEkTier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VariantEkTier_variantId_minMenge_key" ON "VariantEkTier"("variantId", "minMenge");
CREATE INDEX "VariantEkTier_variantId_idx" ON "VariantEkTier"("variantId");
